import asyncio, edge_tts, os, json, subprocess
P=os.environ["HTTPS_PROXY"]
V="tr-TR-AhmetNeural"
# id, text, rate, pitch, volume
L=[
("a1","Mustafa Kemal Atatürk'ün...","-14%","-8Hz","+0%"),
("a2","komaya girmeden önce söylediği son sözü...","-14%","-8Hz","+0%"),
("a3","biliyor musunuz?","-16%","-9Hz","+0%"),
("b1","8 Kasım 1938.","-7%","-9Hz","+0%"),
("b2","Dolmabahçe Sarayı.","-10%","-9Hz","+0%"),
("b3","Atatürk'ün sağlığı, artık son derece ağırlaşmıştı.","-5%","-8Hz","+0%"),
("b4","Türkiye, büyük önderinden gelecek haberleri bekliyordu.","-5%","-8Hz","+0%"),
("c1","Yanında bulunanların aktardığına göre...","-13%","-9Hz","+0%"),
("c2","Atatürk'ün bilinci giderek bulanıklaşıyordu.","-13%","-9Hz","+0%"),
("c3","Çok geçmeden...","-18%","-10Hz","+0%"),
("c4","derin bir komaya girecekti.","-18%","-11Hz","+0%"),
("d1","Tanıklıklara göre...","-16%","-10Hz","+0%"),
("d2","dudaklarından dökülen son söz...","-18%","-11Hz","+0%"),
("d3","Aleykümselam.","-38%","-16Hz","-15%"),
("d4","oldu.","-20%","-12Hz","+0%"),
("e1","İki gün sonra...","-15%","-9Hz","+0%"),
("e2","10 Kasım 1938'de...","-15%","-9Hz","+0%"),
("e3","saat dokuzu beş geçe...","-17%","-10Hz","+0%"),
("e4","Mustafa Kemal Atatürk, hayata gözlerini yumdu.","-18%","-11Hz","+0%"),
("f1","Saygıyla...","-20%","-11Hz","+0%"),
("f2","özlemle...","-20%","-11Hz","+0%"),
("f3","ve minnetle anıyoruz.","-20%","-12Hz","+0%"),
]
async def one(i,t,r,p,v):
    c=edge_tts.Communicate(t,V,rate=r,pitch=p,volume=v,proxy=P)
    await c.save(f"vo/{i}.mp3")
async def main():
    for x in L: await one(*x)
asyncio.run(main())
d={}
for i,*_ in L:
    # trim leading/trailing silence, normalize to 48k mono wav
    subprocess.run(["ffmpeg","-y","-v","error","-i",f"vo/{i}.mp3","-af","silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse","-ar","48000","-ac","1",f"vo/{i}.wav"],check=True)
    dur=float(subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",f"vo/{i}.wav"],capture_output=True,text=True).stdout)
    d[i]=round(dur,3); print(i,d[i])
json.dump(d,open("vo/durations.json","w"),indent=1)
