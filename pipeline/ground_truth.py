"""Builds ground_truth.json from published neighbourhood comparisons (collected BEFORE any evaluation).
verbatim=True: quote is an exact string returned from fetching the page; False: paraphrase/summary from a search snippet or table row."""
import json, random
from pathlib import Path
from hood_defs import H

NY, LO, PA, BE, MX, LA = "new-york-", "london-", "paris-", "berlin-", "mexico-city-", "los-angeles-"
GT = [
 (LA+"silver-lake", NY+"williamsburg", "https://www.complex.com/pop-culture/2014/01/the-williamsburg-of-every-city", "Los Angeles: Williamsburg is Silver Lake (Gawker reader map as reported by Complex)", False),
 (LA+"echo-park", NY+"bushwick", "https://www.complex.com/pop-culture/2014/01/the-williamsburg-of-every-city", "Los Angeles: Bushwick is Echo Park (Gawker reader map as reported by Complex)", False),
 (LA+"west-hollywood", NY+"chelsea", "https://urbanize.la/post/explaining-los-angeles-geography-new-yorkers", "Greenwich Village, Chelsea, Gramercy and NoMad are similar as lifestyle centers to West Hollywood, the Sunset Strip, Beverly Grove...", False),
 (MX+"polanco", LA+"beverly-hills", "https://en.wikipedia.org/wiki/Polanco,_Mexico_City", "[Avenida Presidente Masaryk] is compared by some to Beverly Hills' Rodeo Drive or New York City's Fifth Avenue.", True),
 (LO+"shoreditch", NY+"williamsburg", "https://www.uniplaces.com/neighbourhood/london/shoreditch", "Shoreditch is often compared to Williamsburg (Victorian buildings alongside startups, restaurants, pop-up shops, galleries)", False),
 (LO+"dalston", NY+"williamsburg", "https://www.thebillfold.com/2013/04/the-chelsea-of-new-orleans-french-quarter-the-queens-of-la-venice/", "Here's Sarah Brown comparing Hackney/Dalston in London and Williamsburg in Brooklyn.", True),
 (LO+"mayfair", NY+"upper-east-side", "https://www.abode2.com/a-tale-of-two-cities", "Table pairing Upper East Side with Mayfair (average property price in New York vs. London)", False),
 (LO+"notting-hill", NY+"west-village", "https://www.abode2.com/a-tale-of-two-cities", "living in Notting Hill is the London equivalent to living in the West Village/Soho", True),
 (LO+"hampstead", NY+"park-slope", "https://www.abode2.com/a-tale-of-two-cities", "Table pairing Hampstead with Park Slope, Brooklyn", False),
 (LO+"canary-wharf", NY+"financial-district", "https://www.abode2.com/a-tale-of-two-cities", "Table pairing Canary Wharf with Financial District", False),
 (LO+"camden", NY+"east-village", "https://www.abode2.com/a-tale-of-two-cities", "Table pairing Camden with East Village", False),
 (LO+"chelsea", NY+"west-village", "https://www.abode2.com/a-tale-of-two-cities", "Table pairing London's Chelsea with West Village", False),
 (LO+"islington", NY+"west-village", "https://www.abode2.com/a-tale-of-two-cities", "Table pairing Islington with Greenwich Village / West Village", False),
 (LO+"south-kensington", NY+"soho", "https://www.abode2.com/a-tale-of-two-cities", "South Kensington vs. Soho (section heading)", True),
 (LO+"soho", NY+"chelsea", "https://www.abode2.com/a-tale-of-two-cities", "Table pairing London's Soho with Chelsea / Meatpacking district", False),
 (LO+"brixton", NY+"harlem", "https://www.nbcnews.com/news/world/meghan-markle-prince-harry-s-looming-visit-divides-brixton-n835346", "Brixton has been dubbed 'London's Harlem'", False),
 (LO+"peckham", NY+"bushwick", "https://www.saveur.com/insomniacs-guide-london-peckham/", "Saveur's search for a London equivalent of Bushwick points to Peckham Rye (long-time grit, low cost, gentrification pressure)", False),
 (PA+"le-marais", NY+"west-village", "https://www.eurocheapo.com/blog/paris-vs-new-york-the-neighborhood-showdown.html", "Marais / West Village, Chelsea: verdict 'Spot on' - 'has all of the vivacity of'", True),
 (PA+"le-marais", NY+"chelsea", "https://www.eurocheapo.com/blog/paris-vs-new-york-the-neighborhood-showdown.html", "Marais / West Village, Chelsea: verdict 'Spot on' - 'has all of the vivacity of'", True),
 (PA+"champs-elysees", NY+"times-square", "https://www.eurocheapo.com/blog/paris-vs-new-york-the-neighborhood-showdown.html", "Champs Elysees / Times Square: 'Both are equally avoided by locals.'", True),
 (PA+"canal-saint-martin", NY+"williamsburg", "https://www.nationalgeographic.com/travel/article/young-and-hungry-in-paris", "Like Shoreditch in London, or Williamsburg in New York, it's where the new things are being created in Paris.", True),
 (PA+"canal-saint-martin", LO+"shoreditch", "https://www.nationalgeographic.com/travel/article/young-and-hungry-in-paris", "Like Shoreditch in London, or Williamsburg in New York, it's where the new things are being created in Paris.", True),
 (PA+"la-defense", LO+"canary-wharf", "https://greatruns.com/paris-la-defensenanterre/", "La Defense is Paris' version of London's Canary Wharf/Docklands (also CBRE comparison on defense-92.fr)", False),
 (BE+"prenzlauer-berg", NY+"park-slope", "https://kottke.org/13/04/new-york-elsewhere", "Prenzlauer Berg = Park Slope.", True),
 (BE+"kreuzberg-so36", NY+"williamsburg", "https://travelsofadam.com/where-to-stay-berlin-neighborhoods/", "It's the Brooklyn equivalent of something between Williamsburg and Park Slope.", True),
 (MX+"roma-norte", NY+"williamsburg", "https://en.wikipedia.org/wiki/Colonia_Roma", "Roma has consequently been called the \"Williamsburg of Mexico City.\"", True),
 (MX+"roma-norte", NY+"west-village", "https://saltandwind.com/best-neighborhoods-visit-travel-mexico-city/", "feels the most like New York's West Village", True),
 (MX+"polanco", NY+"upper-east-side", "https://saltandwind.com/best-neighborhoods-visit-travel-mexico-city/", "the affluent neighborhood of Polanco is similar to Manhattan's Upper East Side", True),
 (MX+"condesa", NY+"soho", "https://saltandwind.com/best-neighborhoods-visit-travel-mexico-city/", "Similar to New York's Soho, the neighborhood of Condesa", True),
 (MX+"coyoacan", NY+"park-slope", "https://saltandwind.com/best-neighborhoods-visit-travel-mexico-city/", "Like the Bushwick or Park Slope", True),
 (MX+"zona-rosa", NY+"williamsburg", "https://saltandwind.com/best-neighborhoods-visit-travel-mexico-city/", "Juarez: Much like Williamsburg once was", True),
]
EXCLUDED_NOTE = "Excluded by pre-declared rule (source itself rates the match 'Stretch'): Eurocheapo Passy/UWS, Saint-Germain/UES, Latin Quarter/Greenwich Village."

if __name__ == "__main__":
    ids = {f"{c}-{h[0]}" for c, hs in H.items() for h in hs}
    rows = []
    for a, b, url, quote, verb in GT:
        assert a in ids and b in ids, (a, b)
        rows.append(dict(a=a, b=b, source=url, quote=quote, verbatim=verb))
    rng = random.Random(20261030)
    order = list(range(len(rows))); rng.shuffle(order)
    ndev = round(len(rows) / 3)
    for k, i in enumerate(order):
        rows[i]["split"] = "dev" if k < ndev else "test"
    json.dump({"note": EXCLUDED_NOTE, "seed": 20261030, "pairs": rows}, open(Path(__file__).parent / "ground_truth.json", "w"), indent=1, ensure_ascii=False)
    print(len(rows), "pairs;", ndev, "dev")
