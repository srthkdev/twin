"""Basket definition + resolution to Qloo signals. Output: basket_resolved.json (candidates), later pruned by fetch."""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import qloo

P = "urn:tag:genre:place:"
A, B, M, T, PR, PO = ("urn:entity:artist", "urn:entity:brand", "urn:entity:movie", "urn:entity:tv_show",
                      "urn:entity:person", "urn:entity:podcast")
# (label, search query or tag id, entity type or None for tag, group)
E = lambda label, typ, group, q=None: (label, q or label, typ, group)
CANDIDATES = [
    # music
    E("Radiohead", A, "music"), E("Tame Impala", A, "music"), E("Phoebe Bridgers", A, "music"),
    E("Arctic Monkeys", A, "music"), E("Bon Iver", A, "music"), E("Frank Ocean", A, "music"),
    E("Kendrick Lamar", A, "music"), E("Drake", A, "music"), E("Travis Scott", A, "music"),
    E("Bad Bunny", A, "music"), E("Peso Pluma", A, "music"), E("Karol G", A, "music"), E("Rosalía", A, "music"),
    E("BTS", A, "music"), E("BLACKPINK", A, "music"),
    E("Aphex Twin", A, "music"), E("Daft Punk", A, "music"), E("Peggy Gou", A, "music"),
    E("Charlotte de Witte", A, "music"), E("Kraftwerk", A, "music"),
    E("Morgan Wallen", A, "music"), E("Johnny Cash", A, "music"),
    E("Metallica", A, "music"), E("Rammstein", A, "music"),
    E("Ludovico Einaudi", A, "music"), E("Miles Davis", A, "music"),
    E("Burna Boy", A, "music"), E("Wizkid", A, "music"),
    E("Taylor Swift", A, "music"), E("Beyoncé", A, "music"), E("Ed Sheeran", A, "music"), E("Coldplay", A, "music"),
    E("Billie Eilish", A, "music"), E("David Guetta", A, "music"), E("Arijit Singh", A, "music"),
    E("Fairuz", A, "music"), E("Tarkan", A, "music"), E("Chappell Roan", A, "music"), E("Kylie Minogue", A, "music"),
    # fashion / lifestyle brands
    E("Gucci", B, "fashion"), E("Hermès", B, "fashion"), E("Louis Vuitton", B, "fashion"), E("Rolex", B, "fashion"),
    E("Supreme", B, "fashion"), E("Carhartt", B, "fashion"), E("Nike", B, "fashion"), E("Stüssy", B, "fashion"),
    E("Patagonia", B, "lifestyle"), E("Arc'teryx", B, "lifestyle"), E("Lululemon", B, "lifestyle"),
    E("Aesop", B, "lifestyle"), E("Equinox", B, "lifestyle"), E("Whole Foods Market", B, "lifestyle"),
    E("Zara", B, "fashion"), E("H&M", B, "fashion"), E("Uniqlo", B, "fashion"), E("Birkenstock", B, "fashion"),
    E("Dr. Martens", B, "fashion"), E("Ralph Lauren", B, "fashion"), E("Levi's", B, "fashion"),
    E("Tesla", B, "lifestyle"), E("IKEA", B, "lifestyle"), E("McDonald's", B, "lifestyle"),
    E("Starbucks", B, "lifestyle"), E("Harley-Davidson", B, "lifestyle"), E("Walmart", B, "lifestyle"),
    # film / tv
    E("Parasite", M, "film"), E("Moonlight", M, "film"), E("The Grand Budapest Hotel", M, "film"),
    E("Portrait of a Lady on Fire", M, "film"), E("Lost in Translation", M, "film"),
    E("Barbie", M, "film"), E("Fast X", M, "film"), E("Avengers: Endgame", M, "film"), E("Top Gun: Maverick", M, "film"),
    E("Succession", T, "film"), E("Euphoria", T, "film"), E("Breaking Bad", T, "film"),
    E("RuPaul's Drag Race", T, "film"), E("Friends", T, "film"), E("Love Island", T, "film"),
    # culture
    E("The Joe Rogan Experience", PO, "culture"), E("Dave Chappelle", PR, "culture"), E("Kevin Hart", PR, "culture"),
    E("John Mulaney", PR, "culture"),
    # sport
    E("Real Madrid CF", B, "sport"), E("FC Barcelona", B, "sport"), E("Manchester United", B, "sport"),
    E("Los Angeles Lakers", B, "sport"), E("Ultimate Fighting Championship", B, "sport"), E("Formula One", B, "sport"),
    E("New York Yankees", B, "sport"), E("Liga MX", B, "sport"),
    # place tags
    *[(l, P + t, None, g) for l, t, g in [
        ("Vegan restaurants", "restaurant:vegan", "food"), ("Vietnamese food", "restaurant:vietnamese", "food"),
        ("Turkish food", "restaurant:turkish", "food"), ("Middle Eastern food", "restaurant:middle_eastern", "food"),
        ("Thai food", "restaurant:thai", "food"), ("Indian food", "restaurant:indian", "food"),
        ("Korean food", "restaurant:korean", "food"), ("Chinese food", "restaurant:chinese", "food"),
        ("Dim sum", "restaurant:dim_sum", "food"), ("Sushi", "restaurant:sushi", "food"),
        ("Tacos", "restaurant:taco", "food"), ("Ethiopian food", "restaurant:ethiopian", "food"),
        ("Caribbean food", "restaurant:caribbean", "food"), ("Halal food", "restaurant:halal", "food"),
        ("Kebab shops", "restaurant:kebab_shop", "food"), ("Falafel", "restaurant:falafel", "food"),
        ("Kosher food", "restaurant:kosher", "food"), ("Tapas", "restaurant:tapas", "food"),
        ("French food", "restaurant:french", "food"), ("Italian food", "restaurant:italian", "food"),
        ("Pizza", "restaurant:pizza", "food"), ("Burgers", "restaurant:burgers", "food"),
        ("Fast food", "restaurant:fast_food", "food"), ("Fine dining", "restaurant:fine_dining", "food"),
        ("Steakhouses", "restaurant:steak_house", "food"), ("Brunch", "restaurant:brunch", "food"),
        ("Bakeries", "restaurant:bakery", "food"), ("Bubble tea", "restaurant:bubble_tea_store", "food"),
        ("Organic food", "restaurant:organic", "food"), ("Soul food", "restaurant:soul_food", "food"),
        ("Coffee roasters", "coffee_roasters", "food"), ("Coffee shops", "restaurant:coffee_shop", "food"),
        ("Wine bars", "restaurant:wine_bar", "nightlife"), ("Cocktail bars", "restaurant:cocktail_bar", "nightlife"),
        ("Pubs", "restaurant:pub", "nightlife"), ("Gastropubs", "restaurant:gastropub", "nightlife"),
        ("Breweries", "brewery", "nightlife"), ("Night clubs", "night_club", "nightlife"),
        ("Jazz clubs", "jazz_club", "nightlife"), ("Live music venues", "live_music_venue", "nightlife"),
        ("Karaoke", "karaoke", "nightlife"), ("Salsa bars", "restaurant:salsa_bar", "nightlife"),
        ("Gay bars", "restaurant:gay_bar", "nightlife"), ("Gay night clubs", "gay_night_club", "nightlife"),
        ("Queer bars", "restaurant:queer_bar", "nightlife"), ("Lesbian bars", "restaurant:lesbian_bar", "nightlife"),
        ("Record stores", "record_store", "culture"), ("Art galleries", "art_gallery", "culture"),
        ("Bookstores", "book_store", "culture"), ("Museums", "museum", "culture"),
        ("Theater companies", "theater_company", "culture"), ("Tattoo shops", "tattoo_shop", "culture"),
        ("Vintage clothing", "vintage_clothing_store", "fashion"), ("Thrift stores", "thrift_store", "fashion"),
        ("Boutiques", "boutique", "fashion"), ("Skate shops", "skateboard_shop", "fashion"),
        ("Yoga studios", "yoga_studio", "lifestyle"), ("Pilates studios", "pilates_studio", "lifestyle"),
        ("Gyms", "gym", "lifestyle"), ("Climbing gyms", "rock_climbing_gym", "lifestyle"),
        ("Spas", "spa", "lifestyle"), ("Golf clubs", "golf_club", "lifestyle"), ("Tennis clubs", "tennis_club", "lifestyle"),
        ("Playgrounds", "playground", "lifestyle"), ("Parks", "park", "lifestyle"), ("Barber shops", "barber_shop", "lifestyle"),
        ("Hotels", "hotel", "lifestyle"), ("Markets", "market", "food"), ("Wine stores", "wine_store", "food"),
    ]],
]


def resolve():
    out = []
    for label, q, typ, group in CANDIDATES:
        if typ is None:
            out.append(dict(id="tag-" + q.split(":")[-1].replace("_", "-"), label=label, kind="place-tag", group=group,
                            key="signal.interests.tags", val=q))
            continue
        res = qloo.get("/search", {"query": q, "types": typ, "take": 1}).get("results", [])
        if not res:
            print("UNRESOLVED", label); continue
        r = res[0]
        kind = typ.split(":")[-1].replace("tv_show", "tv").replace("person", "person")
        out.append(dict(id=f"{kind}-" + "".join(c if c.isalnum() else "-" for c in label.lower()).strip("-"),
                        label=label, kind=kind, group=group, key="signal.interests.entities", val=r["entity_id"],
                        resolved_name=r["name"]))
    return out


if __name__ == "__main__":
    items = resolve()
    json.dump(items, open(Path(__file__).parent / "basket_candidates.json", "w"), indent=1, ensure_ascii=False)
    print(len(items), "candidates; real calls", qloo.total_real_calls())
    for it in items:
        if it.get("resolved_name") and it["resolved_name"].lower() != it["label"].lower():
            print("  ", it["label"], "->", it["resolved_name"])
