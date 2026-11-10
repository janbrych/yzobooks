// Builds the benchmark dataset: real books (mostly Czech editions, what the
// app's users scan) with ISBN, title, author and a downloadable cover.
// Usage: node bench/collect.mjs  → bench/data/dataset.json + data/covers/*.jpg
//        DATASET=dataset2 TARGET=700 node bench/collect.mjs  → a second set of
//        new books (other authors, nothing from dataset.json) in data/dataset2.json
import { installFetchCache } from './cache.mjs';
import sharp from 'sharp';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

installFetchCache();
const here = import.meta.dirname;

const AUTHORS_1 = [
  'Rowling, J. K.', 'King, Stephen', 'Pratchett, Terry', 'Čapek, Karel', 'Hrabal, Bohumil', 'Kundera, Milan',
  'Viewegh, Michal', 'Mornštajnová, Alena', 'Tolkien, J. R. R.', 'Christie, Agatha', 'Nesbø, Jo', 'Murakami, Haruki',
  'Orwell, George', 'Hemingway, Ernest', 'Remarque, Erich Maria', 'Bradbury, Ray', 'Asimov, Isaac', 'Sapkowski, Andrzej',
  'Brown, Dan', 'Coelho, Paulo', 'Follett, Ken', 'Grisham, John', 'Larsson, Stieg', 'Keleová-Vasilková, Táňa',
  'Vondruška, Vlastimil', 'Lustig, Arnošt', 'Šabach, Petr', 'Tučková, Kateřina', 'Rudiš, Jaroslav', 'Poláček, Karel',
  'Werich, Jan', 'Sekora, Ondřej', 'Žáček, Jiří', 'Steinbeck, John', 'Saint-Exupéry, Antoine de', 'Kafka, Franz',
  'Dostojevskij, Fjodor Michajlovič', 'Austen, Jane', 'Martin, George R. R.', 'Gaiman, Neil', 'Atwood, Margaret',
  'Ishiguro, Kazuo', 'Hosseini, Khaled', 'Zusak, Markus', 'Green, John', 'Collins, Suzanne', 'Riordan, Rick',
  'Kinney, Jeff', 'Lindgrenová, Astrid', 'Dahl, Roald', 'Backman, Fredrik', 'Ferrante, Elena', 'Mankell, Henning',
  'Läckberg, Camilla', 'Glukhovsky, Dmitry', 'Dick, Philip K.', 'Herbert, Frank', 'Adams, Douglas', 'Vonnegut, Kurt',
  'Fuks, Ladislav', 'Škvorecký, Josef', 'Havel, Václav', 'Klíma, Ivan', 'Topol, Jáchym', 'Hakl, Emil', 'Formanová, Martina',
  'Soukupová, Petra', 'Bílková, Bianca', 'Hůlová, Petra', 'Dousková, Irena', 'Jirotka, Zdeněk', 'Neff, Ondřej',
  'Kotleta, Františka', 'Žamboch, Miroslav', 'Kulhánek, Jiří', 'Foglar, Jaroslav', 'Čtvrtek, Václav', 'Erben, Karel Jaromír',
];

// Second set: other authors, for a fresh test the heuristics weren't tuned on.
const AUTHORS_2 = [
  'Jirásek, Alois', 'Němcová, Božena', 'Hašek, Jaroslav', 'Seifert, Jaroslav', 'Kohout, Pavel', 'Otčenášek, Jan',
  'Vančura, Vladislav', 'Olbracht, Ivan', 'Bass, Eduard', 'Neruda, Jan', 'Mácha, Karel Hynek', 'Hrubín, František',
  'Kubátová, Marie', 'Štíplová, Ljuba', 'Šindelka, Marek', 'Bauer, Jan', 'Kopta, Petr', 'Urban, Miloš', 'Ajvaz, Michal',
  'Vaculík, Ludvík', 'Pavel, Ota', 'Procházková, Iva', 'Körnerová, Hana Marie', 'Lanczová, Lenka', 'Mahler, Zdeněk',
  'Svěrák, Zdeněk', 'Smoljak, Ladislav', 'Drijverová, Martina', 'Březinová, Ivona', 'Fischerová, Daniela', 'Hora, Josef',
  'Rowling, J. K.', 'Meyer, Stephenie', 'Paolini, Christopher', 'Pullman, Philip', 'Lewis, C. S.', 'Funke, Cornelia',
  'Ende, Michael', 'Brezina, Thomas', 'Blyton, Enid', 'Milne, A. A.', 'Carroll, Lewis', 'Verne, Jules', 'May, Karl',
  'Dumas, Alexandre', 'Hugo, Victor', 'Tolstoj, Lev Nikolajevič', 'Čechov, Anton Pavlovič', 'Bulgakov, Michail Afanasjevič',
  'Dickens, Charles', 'Twain, Mark', 'Wilde, Oscar', 'Doyle, Arthur Conan', 'Poe, Edgar Allan', 'Huxley, Aldous',
  'Salinger, J. D.', 'Fitzgerald, F. Scott', 'Kerouac, Jack', 'Bukowski, Charles', 'Irving, John', 'Auster, Paul',
  'McEwan, Ian', 'Rushdie, Salman', 'Eco, Umberto', 'Calvino, Italo', 'Márquez, Gabriel García', 'Allende, Isabel',
  'Zafón, Carlos Ruiz', 'Süskind, Patrick', 'Hesse, Hermann', 'Mann, Thomas', 'Camus, Albert', 'Sartre, Jean-Paul',
  'Houellebecq, Michel', 'Mo, Jen', 'Pamuk, Orhan', 'Oz, Amos', 'Tokarczuk, Olga', 'Lem, Stanisław', 'Szczygieł, Mariusz',
  'Harari, Yuval Noah', 'Sacks, Oliver', 'Hawking, Stephen', 'Dawkins, Richard', 'Gladwell, Malcolm', 'Kahneman, Daniel',
  'Clarke, Arthur C.', 'Heinlein, Robert A.', 'Le Guin, Ursula K.', 'Simmons, Dan', 'Banks, Iain M.', 'Weir, Andy',
  'Sanderson, Brandon', 'Abercrombie, Joe', 'Hobb, Robin', 'Jordan, Robert', 'Rothfuss, Patrick', 'Lovecraft, H. P.',
  'Koontz, Dean R.', 'Crichton, Michael', 'Child, Lee', 'Patterson, James', 'Baldacci, David', 'Connelly, Michael',
  'Rankin, Ian', 'Gerritsenová, Tess', 'Cornwellová, Patricia', 'Higginsová Clarková, Mary', 'Steelová, Danielle',
  'Moyesová, Jojo', 'Kepler, Lars', 'Adler-Olsen, Jussi', 'Nesser, Håkan', 'Indriðason, Arnaldur', 'Fitzek, Sebastian',
  'Hawkinsová, Paula', 'Flynnová, Gillian', 'Mooreová, Liane', 'Picoultová, Jodi', 'Kingová, Laurie R.', 'Carrisi, Donato',
  'Dicker, Joël', 'Musso, Guillaume', 'Levy, Marc', 'Gavalda, Anna', 'Schmitt, Éric-Emmanuel', 'Ruiz Zafón, Carlos',
];
const AUTHORS = process.env.DATASET && process.env.DATASET !== 'dataset' ? AUTHORS_2 : AUTHORS_1;
const DATASET = process.env.DATASET || 'dataset';
const TARGET = Number(process.env.TARGET || 1e9);
const PER_AUTHOR = Number(process.env.PER_AUTHOR || 7);

function fold(t) { return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
function cleanAuthor(a) {
  const s = a.replace(/,?\s*\d{4}-?(\d{4})?\s*$/, '').trim();
  const m = s.match(/^([^,]+),\s*(.+)$/);
  return m ? `${m[2]} ${m[1]}` : s;
}
function code(i) { return String(i).replace(/[^0-9Xx]/g, '').toUpperCase(); }

const fields = ['title', 'authors', 'isbns', 'publicationDates', 'formats', 'languages'].map((f) => `&field[]=${f}`).join('');
const books = [];
const seenTitles = new Set();
const seenIsbns = new Set();
if (DATASET !== 'dataset' && existsSync(path.join(here, 'data', 'dataset.json'))) {
  for (const b of JSON.parse(readFileSync(path.join(here, 'data', 'dataset.json'), 'utf8'))) {
    seenTitles.add(fold(b.mainTitle));
    seenIsbns.add(b.isbn);
  }
}

for (const author of AUTHORS) {
  if (books.length >= TARGET) break;
  const url = `https://www.knihovny.cz/api/v1/search?lookfor=${encodeURIComponent(author)}&type=Author&limit=60&sort=year&${fields}`;
  const data = await (await fetch(url)).json().catch(() => ({}));
  const recs = (data.records || []).filter((r) => (r.formats || []).some((f) => /BOOKS/.test(f)) && (r.isbns || []).length);
  let taken = 0;
  for (const r of recs) {
    if (taken >= PER_AUTHOR || books.length >= TARGET) break;
    const primary = Object.keys(r.authors?.primary || {});
    if (!primary.length) continue;
    const mainTitle = String(r.title).split(/\s[:/=]\s?/)[0].trim();
    const key = fold(mainTitle);
    if (!key || key.length < 3 || seenTitles.has(key)) continue;
    const isbn = code(r.isbns[0]);
    if (!/^97[89]\d{10}$/.test(isbn) || seenIsbns.has(isbn)) continue;
    const year = Number(String(r.publicationDates?.[0] || '').match(/\d{4}/)?.[0] || 0);
    if (year && year < 1995) continue;
    // Cover available?
    const file = path.join(here, 'data', 'covers', `${isbn}.jpg`);
    if (!existsSync(file)) {
      const res = await fetch(`https://www.knihovny.cz/Cover/Show?isbn=${isbn}&size=large`);
      if (!res.ok || !/image/.test(res.headers.get('content-type') || '')) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const meta = await sharp(buf).metadata().catch(() => null);
      if (!meta || meta.width < 150 || meta.height < 200) continue;
      await sharp(buf).jpeg({ quality: 92 }).toFile(file);
    }
    seenTitles.add(key);
    books.push({ isbn, title: String(r.title), mainTitle, author: primary.map(cleanAuthor).join(', '), year, lang: r.languages?.[0] || '' });
    taken++;
  }
  console.log(`${author}: ${taken} (total ${books.length})`);
}

writeFileSync(path.join(here, 'data', `${DATASET}.json`), JSON.stringify(books, null, 1));
console.log('books with covers:', books.length);
