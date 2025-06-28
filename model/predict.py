import pandas as pd
import joblib
import sys
import json
import os

model_dir = os.path.dirname(__file__)
mlp = joblib.load(os.path.join(model_dir, 'mlp_model.pkl'))
scaler = joblib.load(os.path.join(model_dir, 'scaler.pkl'))

input_str = sys.argv[1]
input_data = pd.DataFrame([json.loads(input_str)])

input_data['isVerified'] = input_data['isVerified'].astype(int)
X_scaled = scaler.transform(input_data)
cluster_pred = mlp.predict(X_scaled)[0]

risk_map = {-1: 'HIGH RISK', 0: 'LOW RISK'}
risk_label = risk_map.get(cluster_pred, 'unknown')

print(json.dumps({
    'cluster': int(cluster_pred),
    'risk': risk_label
}))