// Oyun listesini üretir: server/games.json
// Liste "id | ad | kısa kod | renk" satırlarıdır; renk yazılmazsa oyunun kimliğinden sabit bir renk türetilir.
// Sıra, ana sayfadaki "popülerlik" sırasıdır. Yeni oyun için buraya bir satır ekleyip `node scripts/build-games.mjs` çalıştır.
// Sadece bilgisayar oyunları (mobil oyun yok). Steam'de olmayan PC oyunları da var (Valorant, LoL, Knight Online...).
import { writeFileSync } from 'node:fs';

const LIST = `
cs2 | Counter-Strike 2 | CS2 | #F5A524
dota2 | Dota 2 | D2 | #E4572E
valorant | Valorant | VAL | #FF4655
lol | League of Legends | LoL | #0AC8B9
pubg | PUBG: Battlegrounds | PUBG | #D9A441
apex | Apex Legends | APX | #C2412D
cod | Call of Duty | CoD | #6B7A3C
fortnite | Fortnite | FN | #8C5BFF
overwatch2 | Overwatch 2 | OW2 | #F99E1A
r6 | Rainbow Six Siege | R6 | #4A78F0
rust | Rust | RUST | #B5482A
marvelrivals | Marvel Rivals | MR | #E23B4D
deltaforce | Delta Force | DF | #5E7F4B
battlefield6 | Battlefield 6 | BF6 | #3B82C4
thefinals | THE FINALS | FIN | #E8A21A
gta | GTA Online | GTA | #7CB518
fivem | FiveM | 5M | #F40552
rocketleague | Rocket League | RL | #1E88FF
eafc | EA SPORTS FC 26 | FC | #19B36B
minecraft | Minecraft | MC | #5DA13A
warframe | Warframe | WF | #3E6FB0
tf2 | Team Fortress 2 | TF2 | #C4612F
warthunder | War Thunder | WT | #C9892B
helldivers2 | HELLDIVERS 2 | HD2 | #F2C500
deadbydaylight | Dead by Daylight | DbD | #A1262B
palworld | Palworld | PW | #3AA6D8
lethalcompany | Lethal Company | LC | #D94A2B
phasmophobia | Phasmophobia | PH | #4B6C8C
repo | R.E.P.O. | REPO | #E4572E
peak | PEAK | PEAK | #3DAA6E
schedule1 | Schedule I | S1 | #4C8B3A
valheim | Valheim | VH | #6A8FB7
enshrouded | Enshrouded | ENS | #C27A3F
dayz | DayZ | DAYZ | #6E7B4C
ark | ARK: Survival Evolved | ARK | #2F7F8F
arkascended | ARK: Survival Ascended | ASA | #3A9AAE
sevendays | 7 Days to Die | 7D2D | #B3472E
projectzomboid | Project Zomboid | PZ | #8B6F47
oncehuman | Once Human | OH | #C0432C
dune | Dune: Awakening | DUNE | #D9953A
conanexiles | Conan Exiles | CE | #B0452F
scum | SCUM | SCUM | #7A8A3A
unturned | Unturned | UNT | #E0B43A
theisle | The Isle | ISLE | #4F8E6A
sonsoftheforest | Sons Of The Forest | SotF | #5A7D3A
theforest | The Forest | TF | #4D6B33
raft | Raft | RAFT | #2E8FC7
subnautica | Subnautica | SUB | #1E9BC9
satisfactory | Satisfactory | SAT | #E6962B
factorio | Factorio | FAC | #D98A2B
terraria | Terraria | TRR | #3C9D5B
stardew | Stardew Valley | SDV | #7DB84A
corekeeper | Core Keeper | CK | #8C6A4A
dontstarvetogether | Don't Starve Together | DST | #6B5B4B
humanfallflat | Human Fall Flat | HFF | #F2994A
itakestwo | It Takes Two | ITT | #E97FA3
overcooked2 | Overcooked! 2 | OC2 | #F57C3A
gangbeasts | Gang Beasts | GB | #F26B6B
fallguys | Fall Guys | FG | #E85BA8
amongus | Among Us | AU | #C0392B
goosegooseduck | Goose Goose Duck | GGD | #F2B13A
partyanimals | Party Animals | PA | #F28D3B
golfwithfriends | Golf With Your Friends | GWYF | #3CA55C
vrchat | VRChat | VRC | #5A7CE0
garrysmod | Garry's Mod | GMOD | #2E86C1
contentwarning | Content Warning | CW | #E0B93A
outlasttrials | The Outlast Trials | OT | #B03A3A
hunt | Hunt: Showdown 1896 | HUNT | #B5792E
escapefromtarkov | Escape from Tarkov | EFT | #8A8A5A
arenabreakout | Arena Breakout: Infinite | ABI | #4F7A5B
arma3 | Arma 3 | A3 | #6F7F3F
armareforger | Arma Reforger | ARF | #7B8A44
squad | Squad | SQD | #6B7F4A
hellletloose | Hell Let Loose | HLL | #7A6B3A
insurgency | Insurgency: Sandstorm | INS | #A07A3A
readyornot | Ready or Not | RoN | #4A5D7A
payday2 | PAYDAY 2 | PD2 | #C9302C
payday3 | PAYDAY 3 | PD3 | #D6402C
l4d2 | Left 4 Dead 2 | L4D2 | #B5352E
killingfloor3 | Killing Floor 3 | KF3 | #B03A2E
vermintide2 | Warhammer: Vermintide 2 | VT2 | #A8732F
darktide | Warhammer 40,000: Darktide | DT | #8A7A4A
spacemarine2 | Warhammer 40,000: Space Marine 2 | SM2 | #3B5BA9
deeprock | Deep Rock Galactic | DRG | #E6A12B
riskofrain2 | Risk of Rain 2 | RoR2 | #4D8FD6
remnant2 | Remnant II | R2 | #8A6A4A
darkanddarker | Dark and Darker | DaD | #6A4A8A
chivalry2 | Chivalry 2 | CH2 | #B5502E
mordhau | Mordhau | MOR | #8A5A3A
naraka | NARAKA: BLADEPOINT | NRK | #3FA6A0
stalcraft | STALCRAFT: X | SCX | #C06A2A
paladins | Paladins | PLD | #3F7FD0
brawlhalla | Brawlhalla | BH | #4F8FE0
halo | Halo Infinite | HI | #4D9A5F
cs16 | Counter-Strike 1.6 | 1.6 | #D98A2B
css | Counter-Strike: Source | CSS | #C9892B
wow | World of Warcraft | WoW | #E0A82E
ffxiv | FINAL FANTASY XIV | FF14 | #5B7FD6
eso | The Elder Scrolls Online | ESO | #B08A3A
lostark | Lost Ark | LA | #3F8FD9
newworld | New World: Aeternum | NW | #3F9AA8
blackdesert | Black Desert | BDO | #C0412D
albion | Albion Online | ALB | #3A8F8F
maplestory | MapleStory | MS | #F2893A
runescape | RuneScape | RS | #C9A227
guildwars2 | Guild Wars 2 | GW2 | #B03A3A
throneandliberty | Throne and Liberty | T&L | #8A6FD0
wherewindsmeet | Where Winds Meet | WWM | #6BA58A
mir4 | MIR4 | MIR4 | #9A3A3A
knight | Knight Online | KO | #B8862B
metin2 | Metin2 | M2 | #C9622E
silkroad | Silkroad Online | SRO | #C29A3A
zula | Zula | ZULA | #3F7A4A
wolfteam | Wolfteam | WLF | #D03A3A
pointblank | Point Blank | PB | #B03A2E
poe | Path of Exile | PoE | #8A6A3A
poe2 | Path of Exile 2 | PoE2 | #A8803A
diablo4 | Diablo IV | D4 | #A82A2A
lastepoch | Last Epoch | LE | #8A4AB0
torchlight | Torchlight: Infinite | TLI | #E07A2B
grimdawn | Grim Dawn | GD | #7A5A3A
destiny2 | Destiny 2 | DES2 | #6B7FA8
division2 | Tom Clancy's The Division 2 | TD2 | #E07A2B
borderlands | Borderlands 4 | BL4 | #F2A82B
monsterhunterwilds | Monster Hunter Wilds | MHWs | #D9A23A
monsterhunterworld | Monster Hunter: World | MHW | #C28A3A
eldenring | ELDEN RING | ER | #C9A227
nightreign | ELDEN RING NIGHTREIGN | NR | #A8803A
bg3 | Baldur's Gate 3 | BG3 | #B03A3A
seaofthieves | Sea of Thieves | SoT | #2E86A8
fallout76 | Fallout 76 | F76 | #D9A23A
dyinglight | Dying Light 2 | DL2 | #D9742B
rdr2 | Red Dead Redemption 2 | RDR2 | #B03A2E
genshin | Genshin Impact | GI | #5FA8D9
wuthering | Wuthering Waves | WuWa | #5FB0C9
barotrauma | Barotrauma | BT | #3A7A8A
bloonstd6 | Bloons TD 6 | BTD6 | #E0A82E
efootball | eFootball | EF | #2E7BC4
nba2k | NBA 2K26 | 2K | #E04A2E
f1 | F1 25 | F1 | #E0301E
forza | Forza Horizon 6 | FH | #E0662E
assettocorsa | Assetto Corsa | AC | #C9302C
lemans | Le Mans Ultimate | LMU | #2E5FA8
ets2 | Euro Truck Simulator 2 | ETS2 | #E6A12B
ats | American Truck Simulator | ATS | #3A7FBF
beamng | BeamNG.drive | BNG | #E67A2B
snowrunner | SnowRunner | SR | #E0A12B
farmingsim | Farming Simulator 25 | FS25 | #6FA83A
flightsim | Microsoft Flight Simulator 2024 | MSFS | #3A8FD0
elitedangerous | Elite Dangerous | ED | #E0802B
aoe2 | Age of Empires II: DE | AoE2 | #C9A227
aoe4 | Age of Empires IV | AoE4 | #B8902B
civ6 | Sid Meier's Civilization VI | CIV6 | #3A8FC0
civ7 | Sid Meier's Civilization VII | CIV7 | #3A7FB0
hoi4 | Hearts of Iron IV | HoI4 | #6A7F4A
ck3 | Crusader Kings III | CK3 | #A83A3A
eu4 | Europa Universalis IV | EU4 | #3F7F9A
stellaris | Stellaris | STL | #3A9AB0
totalwarwh3 | Total War: WARHAMMER III | TWW3 | #8A3AA8
starcraft2 | StarCraft II | SC2 | #3A7FC9
bannerlord | Mount & Blade II: Bannerlord | MBII | #8A6A3A
rimworld | RimWorld | RW | #A8603A
mtga | Magic: The Gathering Arena | MTGA | #6A5AA8
hearthstone | Hearthstone | HS | #D9A23A
masterduel | Yu-Gi-Oh! Master Duel | YGO | #5A3AA8
sf6 | Street Fighter 6 | SF6 | #E0501E
tekken8 | TEKKEN 8 | T8 | #C9302C
mk1 | Mortal Kombat 1 | MK1 | #C9A227
other | Diğer / Other | ··· | #8A91A8
`;

const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

const games = LIST.trim().split('\n').map((line) => {
  const [id, name, short, color] = line.split('|').map((x) => x.trim());
  return { id, name, short, color: color || hslToHex(hash(id) % 360, 62, 46) };
});

const seen = new Set();
for (const g of games) {
  if (!/^[a-z0-9]+$/.test(g.id)) throw new Error('Geçersiz id: ' + g.id);
  if (seen.has(g.id)) throw new Error('Yinelenen id: ' + g.id);
  if (!/^#[0-9a-f]{6}$/i.test(g.color)) throw new Error('Geçersiz renk: ' + g.id);
  if (g.short.length > 5) throw new Error('Kısa kod uzun: ' + g.id);
  seen.add(g.id);
}
writeFileSync(new URL('../server/games.json', import.meta.url), JSON.stringify(games, null, 1));
console.log(games.length + ' oyun yazıldı');
