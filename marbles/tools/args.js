// Boîte à outils des billes : la LECTURE STRICTE de la ligne de commande, partagée
// par les outils (simulate.js, compare.js, play.js, case.js). Une option inconnue,
// une option à valeur sans sa valeur (ou suivie d'une autre option), une option
// donnée deux fois, un argument en trop : une erreur claire, jamais un silence qui
// ferait tourner l'outil sur autre chose que ce qu'on a demandé. Pur : les outils
// disent l'erreur et s'arrêtent eux-mêmes.
//
// `argv` : les arguments (process.argv.slice(2)) ; `spec` :
//   values       les options qui prennent une valeur (« --seed 42 ») ;
//   flags        les options sans valeur (« --json ») ;
//   positionals  le nombre d'arguments sans tiret permis (0 par défaut).
// -> { option(nom) : la valeur ou undefined, flag(nom) : vrai ou faux, positionals }.
export function parseArgs(argv, { values = [], flags = [], positionals = 0 } = {}) {
  const options = new Map();
  const rest = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (values.includes(arg) || flags.includes(arg)) {
      if (options.has(arg)) throw new Error(`${arg} donnée deux fois.`);
      if (flags.includes(arg)) {
        options.set(arg, true);
        continue;
      }
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) throw new Error(`${arg} attend une valeur.`);
      options.set(arg, value);
      index += 1;
    } else if (arg.startsWith("--")) {
      throw new Error(`option inconnue ${arg}.`);
    } else {
      rest.push(arg);
    }
  }
  if (rest.length > positionals) throw new Error(`argument en trop : ${rest.slice(positionals).join(" ")}.`);
  return {
    option: (name) => (values.includes(name) ? options.get(name) : undefined),
    flag: (name) => options.get(name) === true,
    positionals: rest,
  };
}
