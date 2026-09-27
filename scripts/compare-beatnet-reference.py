"""Compare the JS beat stage with the pinned upstream Python process method.
Requires numpy. Pass the downloaded upstream .py and activation JSON explicitly.
The upstream meter branch is replaced with an undifferentiated beat event;
its discarded deletion is replaced with bounded population restoration.
No Python dependency is needed by the application.
"""
import ast, json, sys, types
import numpy as np

class Random:
    def __init__(self, seed): self.seed = seed
    def draw(self):
        self.seed = (1664525 * self.seed + 1013904223) & 0xffffffff
        return self.seed / 4294967296
    def randint(self, high): return int(self.draw() * high)
    def uniform(self, low, high, size): return np.array([low + (high-low)*self.draw() for _ in range(size)])
    def choice(self, values, size=1, replace=True, p=None):
        values = np.arange(values) if isinstance(values, int) else np.asarray(values)
        result=[]
        for _ in range(size):
            u=self.draw()
            index=int(u*len(values)) if p is None else min(int(np.searchsorted(np.cumsum(p), u)), len(values)-1)
            result.append(values[index])
        return np.array(result)

def trim(particles, size):
    removed=set()
    while len(removed)<len(particles)-size: removed.add(rng.randint(len(particles)))
    return np.delete(particles, sorted(removed))

class Extract(ast.NodeTransformer):
    def visit_Attribute(self, node):
        if isinstance(node.value, ast.Name) and node.value.id=='np' and node.attr=='random': return ast.Name(id='rng',ctx=ast.Load())
        return self.generic_visit(node)
    def visit_If(self,node):
        text=ast.unparse(node.test)
        if 'self.plot' in text: return None
        if 'gathering' in text:
            node.body=ast.parse('if activations[i] > 0.4:\n self.path = np.append(self.path, [[self.offset + self.counter * self.T, 2]], axis=0)').body
        return self.generic_visit(node)
    def visit_Expr(self,node):
        if isinstance(node.value,ast.Call) and ast.unparse(node.value.func)=='np.delete':
            return ast.parse('self.particles = trim(self.particles, self.particle_size)').body[0]
        return self.generic_visit(node)

source=ast.parse(open(sys.argv[1],encoding='utf-8').read())
cls=next(n for n in source.body if isinstance(n,ast.ClassDef) and n.name=='particle_filter_cascade')
process=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='process')
funcs=[next(n for n in source.body if isinstance(n,ast.FunctionDef) and n.name==name) for name in ['beat_densities','universal_resample']]
module=ast.fix_missing_locations(Extract().visit(ast.Module(body=funcs+[process],type_ignores=[])))
exec(compile(module,'upstream-beat-stage','exec'))
rows=json.load(open(sys.argv[2],encoding='utf-8-sig'))
rng=Random(int(sys.argv[3]) if len(sys.argv)>3 else 1)
intervals=np.arange(14,56)
first=np.cumsum(np.r_[0,intervals[:-1]])
state_intervals=np.repeat(intervals,intervals)
positions=np.concatenate([np.arange(i)/i for i in intervals])
last=first+intervals-1
weights=np.exp(-60*np.abs(intervals[None,:]/intervals[:,None]-1))
weights[weights<=np.spacing(1)]=0
weights/=weights.sum(axis=1)[:,None]
src,dst=np.nonzero(weights)
st=types.SimpleNamespace(num_states=len(positions),state_intervals=state_intervals,first_states=[first],last_states=list(last))
pointers=np.zeros(len(positions),dtype=int);pointers[positions<1/56]=2
model=types.SimpleNamespace(offset=0,T=.02,ig_threshold=.4,plot=[],mode='online',counter=-1,path=np.zeros((1,2)),beat=first,st=st,om=types.SimpleNamespace(pointers=pointers),tm=[first[dst],last[src],weights[src,dst]],particle_size=1500)
model.particles=np.sort(rng.choice(np.arange(len(positions)-1),1500))
trace=[]
for row in rows:
    previous=len(model.path)
    process(model,np.array(row[-2:]))
    checksum=int(np.sum(model.particles.astype(np.int64)*np.arange(1,len(model.particles)+1))) & 0xffffffff
    trace.append([len(model.path)>previous,checksum,len(model.particles)])
print(json.dumps(trace))
