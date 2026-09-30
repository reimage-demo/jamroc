// Initial inventory supplied by Jam-Roc; prices and extras await bar confirmation.
const groups = {
  Rum: ["Wray & Nephew White Overproof Rum", "Appleton Estate Signature Rum"],
  Cognac: ["Hennessy VS", "Hennessy VSOP", "Rémy Martin VSOP", "Rémy Martin 1738", "Courvoisier VS", "D’Ussé Cognac"],
  Tequila: ["Don Julio Blanco", "Patrón Silver", "Espolòn Blanco", "Espolòn Reposado", "Casamigos Blanco", "Casamigos Reposado", "Teremana Reposado"],
  Vodka: ["Cîroc Coconut", "Cîroc Peach", "Cîroc Red Berry", "Cîroc Summer Watermelon"],
  Whiskey: ["Crown Royal", "Crown Royal Apple", "Johnnie Walker Red Label", "Johnnie Walker Double Black", "Johnnie Walker A Song of Fire", "Jameson", "The Glenlivet 12"],
  "Flavored Spirits & Liqueurs": ["XXIV Strawberry Grape", "XXIV Mango", "XXIV Watermelon", "XXIV Apple", "Baileys Irish Cream", "Campari", "Taylor Port"],
  Sparkling: ["Luc Belaire Bleu", "Luc Belaire Gold"],
};
const id = (name) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const drinkDefaults = {
  enabled: true,
  spirits: Object.entries(groups).flatMap(([group, names]) => names.map((name) => ({ id: id(name), name, group, available: true }))),
  chasers: [{ id: "stoney-ginger-beer", name: "Stoney Ginger Beer", group: "Chasers", available: true }],
  extras: [],
};
