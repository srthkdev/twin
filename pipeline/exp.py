"""Dev-only experiments: feature variants + LLM/Qloo rank fusion."""
import json, math, statistics as st, sys
import evals as E, lift
from twins import cos  # noqa
basket=lift.load_basket(); ids=[b["id"] for b in basket]
gt=json.load(open("ground_truth.json"))["pairs"]
dev=[p for p in gt if p["split"]=="dev"]; test=[p for p in gt if p["split"]=="test"]
V,builds=E.all_hoods(ids,"V"); R,_=E.all_hoods(ids,"RAW",builds=builds)
idxV={h["id"]:h for hs in V.values() for h in hs}; idxR={h["id"]:h for hs in R.values() for h in hs}
def zcols(hs):  # standardize raw within city across hoods
    n=len(hs[0]["v"]); out={}
    for k in range(n):
        col=[h["v"][k] for h in hs]; m,s=st.mean(col),st.pstdev(col) or 1
        for h in hs: out.setdefault(h["id"],[]).append((h["v"][k]-m)/s)
    return out
RZ={}
for c,hs in R.items(): RZ.update(zcols(hs))
def order_feat(s,tc,alpha):
    def vec(hid): return idxV[hid]["v"]+[alpha*x for x in RZ[hid]] if alpha else idxV[hid]["v"]
    if alpha=="rawz": vec=lambda hid: RZ[hid]
    src=vec(s); return sorted([h["id"] for h in V[tc]],key=lambda h:-cos(src,vec(h)))
def order_llm(s,tc):
    names=[h["name"] for h in V[tc]]; byname={h["name"]:h["id"] for h in V[tc]}
    arr=E.llm_rank(idxV[s]["name"],E.city_of(s),tc,names)
    seen=list(dict.fromkeys(x for x in arr if x in byname)); seen+= [n for n in names if n not in seen]
    return [byname[n] for n in seen]
def rrf(orders,weights,k=10):
    sc={}
    for o,w in zip(orders,weights):
        for i,h in enumerate(o): sc[h]=sc.get(h,0)+w/(k+i+1)
    return sorted(sc,key=lambda h:-sc[h])
def evaluate(pairs,fn):
    rs=[fn(s,E.city_of(t)).index(t)+1 for p,s,t in E.directed(pairs)]
    return E.metrics(rs)
split=dev if (len(sys.argv)<2 or sys.argv[1]!="test") else test
print("split",'test' if split is test else 'dev',len(split))
for a in [0,0.3,0.5,1.0,"rawz"]:
    print("feat alpha",a,evaluate(split,lambda s,tc:order_feat(s,tc,a)))
print("llm",evaluate(split,order_llm))
for a in [0,0.5]:
  for w in [0.3,0.5,0.7,1.0]:
    print(f"rrf llm+feat(a={a}) w_qloo={w}",evaluate(split,lambda s,tc:rrf([order_llm(s,tc),order_feat(s,tc,a)],[1,w])))
