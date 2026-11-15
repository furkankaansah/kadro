import subprocess,glob,os,json,numpy as np,wave
d={}
for f in sorted(glob.glob("vo/*.mp3")):
    i=os.path.basename(f)[:-4]
    raw=subprocess.run(["ffmpeg","-v","error","-i",f,"-ar","48000","-ac","1","-f","s16le","-"],capture_output=True).stdout
    a=np.frombuffer(raw,'<i2').astype(np.float32)/32768
    e=np.sqrt(np.convolve(a*a,np.ones(480)/480,'same'))
    on=np.where(e>10**(-48/20))[0]
    s=max(0,on[0]-int(0.08*48000)); t=min(len(a),on[-1]+int(0.15*48000))
    b=a[s:t].copy(); fi=int(0.01*48000); b[:fi]*=np.linspace(0,1,fi); b[-fi:]*=np.linspace(1,0,fi)
    with wave.open(f"vo/{i}.wav","wb") as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(48000);w.writeframes((b*32767).astype('<i2').tobytes())
    d[i]=round(len(b)/48000,3)
json.dump(d,open("vo/durations.json","w"),indent=1); print(d)
