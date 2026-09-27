"""Development-only BeatNet+ ONNX export and recurrent parity verification.
Uses an explicitly provided pinned upstream model.py and weights (weights_only).
"""
import importlib.util, json, sys
from pathlib import Path
import numpy as np
import torch
import onnxruntime as ort
from torch import nn
root=Path(sys.argv[1]);torch.set_num_threads(1)
spec=importlib.util.spec_from_file_location('beatnet_plus_reference',root/'model.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Export(nn.Module):
    def __init__(self,model):
        super().__init__();self.model=model
    def forward(self,features,hidden,cell):
        x=self.model._extract_features(features)
        x,(h,c)=self.model.lstm(x,(hidden,cell))
        return self.model.output_linear(x).transpose(1,2),h,c
for name in ['generic_weights','generic_main_weights']:
    model=module.BeatNetPlusBranch().eval()
    weights=torch.load(root/(name+'.pt'),map_location='cpu',weights_only=True)
    model.load_state_dict(weights,strict=True)
    wrapper=Export(model).eval()
    inputs=(torch.zeros(1,1,288),torch.zeros(4,1,150),torch.zeros(4,1,150))
    output=root/(name+'.onnx')
    torch.onnx.export(wrapper,inputs,str(output),input_names=['features','hidden','cell'],output_names=['logits','next_hidden','next_cell'],opset_version=17,dynamo=False)
    session=ort.InferenceSession(str(output),providers=['CPUExecutionProvider'])
    rng=np.random.default_rng(1729);h=np.zeros((4,1,150),np.float32);c=h.copy();max_error=0
    model.reset_hidden()
    with torch.no_grad():
        for frame in range(200):
            features=rng.uniform(0,1,(1,1,288)).astype(np.float32)
            expected=model(torch.from_numpy(features)).numpy()
            actual,h,c=session.run(None,{'features':features,'hidden':h,'cell':c})
            max_error=max(max_error,float(np.max(np.abs(actual-expected))))
            np.testing.assert_allclose(actual,expected,rtol=1e-4,atol=1e-4)
    print(json.dumps({'model':name,'frames':200,'maxLogitError':max_error,'bytes':output.stat().st_size}))
