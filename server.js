const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const cors = require('cors');
const axios = require('axios');
const { spawn } = require('child_process');
const { json } = require('stream/consumers');
require('dotenv').config();


const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.get('/api/market-summary', async (req, res) => {
  try {
    const [globalRes, fearRes] = await Promise.all([
      axios.get('https://api.coingecko.com/api/v3/global'),
      axios.get('https://api.alternative.me/fng/')
    ]);
    const globalData = globalRes.data.data;
    const fearData = fearRes.data.data[0];

    res.json({
      totalMarketCapUSD: globalData.total_market_cap.usd,
      btcMarketCapPercent: globalData.market_cap_percentage.btc,
      solMarketCapPercent: globalData.market_cap_percentage.sol,
      btcDominance: globalData.market_cap_percentage.btc,
      fearIndex: fearData.value,
      fearLevel: fearData.value_classification
    });
  } catch(err) {
    console.error('API error:', err.message);
    res.status(500).json({ error: 'Failed to fetch market summary' });
  }
});


app.get('/api/solana-inflow', async (req, res) => {
  try {
    const { data } = await axios.get('https://api.llama.fi/protocols');

    const solanaProtocols = data
      .filter((p) => p.chain === 'Solana')
      .map((p) => ({
        name: p.name,
        tvl: p.tvl,
        change1d: p.change_1d,
        change7d: p.change_7d,
        url: p.url
      }));

    res.json(solanaProtocols);
  } catch (error) {
    console.error('Error fetching inflow data:', error.message);
    res.status(500).json({ error: 'Failed to fetch inflow data' });
  }
});

const JUPITER_SEARCH_API = 'https://lite-api.jup.ag/tokens/v2/search';

app.get('/api/rugcheck/:token', async (req, res) => {
  const token = req.params.token;

  try {
    // ✅ Step 1: Search token info from Jupiter
    const searchRes = await axios.get(`${JUPITER_SEARCH_API}?query=${token}`);
    const tokens = searchRes.data;
    if (!tokens.length) {
      return res.status(404).json({ error: 'Token not found in Jupiter search' });
    }
    const tokenData = tokens[0];
    const tokenInput = {
      circSupply: tokens.circSupply || 0,
      totalSupply: tokens.totalSupply || 0,
      price: tokens.usdPrice || 0,
      mcap: tokens.mcap || 0,
      fdv: tokens.fdv || 0,
      topHolderPrecentage: tokens.audit?.topHoldersPercentage || 0,
      isVerified: tokens.isVerified || false
    };

    const py = spawn('python3', ['model/predict.py', JSON.stringify(tokenInput)]);

    let output = '';
    py.stdout.on('data', (data) => {
      output += data.toString();
    });

    py.stderr.on('data', (err) => {
      console.error('[Python stderr]', err.toString());
    });

    py.on('close', () => {
      try {
        const result = JSON.parse(output);

        result.name = tokenData.name || 'Unknown';
        result.symbol = tokenData.symbol || 'Unknown';
        result.circSupply = tokenData.circSupply || 0;
        result.totalSupply = tokenData.totalSupply || 0;
        result.liquidity = tokenData.liquidity || 0;
        result.mcap = tokenData.mcap || 0;
        result.fdv = tokenData.fdv || 0;

        res.json(result);
      } catch (e) {
        console.error('[Parse Error]', e.message);
        res.status(500).json({ error: 'Failed to parse prediction result' });
      }
    });

  } catch (err) {
    console.error('[API Error]', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to process rugcheck', reason: err.message });
  }
});

// WebSocket untuk streaming data harga solana dan bitcoin (aktifkan vpn karena binance tidak bisa di akses di indo)
const solanaWS = new WebSocket('wss://stream.binance.com:9443/ws/solusdt@trade');
const btcWS = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@trade');

btcWS.on('open', () => {
  console.log('Connected to Binance BTC WebSocket');
});

btcWS.on('message', (data) => {
  const parsed = JSON.parse(data);
  const price = parseFloat(parsed.p);

  wss.clients.forEach((client) => {
    if(client.readyState == WebSocket.OPEN){
      client.send(JSON.stringify({ symbol: 'BTC', price }));
    }
  });
});

solanaWS.on('open', () => {
  console.log('Connected to Binance Solana WebSocket');
});

solanaWS.on('message', (data) => {
  const parsed = JSON.parse(data);
  const price = parseFloat(parsed.p);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ symbol: 'SOL', price }));
    }
  });
});




server.listen(5001, () => {
  console.log('Backend WebSocket relay running on http://localhost:5001');
});
