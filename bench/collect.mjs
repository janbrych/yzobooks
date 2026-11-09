// Builds the benchmark dataset: real books (mostly Czech editions, what the
// app's users scan) with ISBN, title, author and a downloadable cover.
// Usage: node bench/collect.mjs  → bench/data/dataset.json + data/covers/*.jpg
import { installFetchCache } from './cache.mjs';
import sharp from 'sharp';
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

installFetchCache();
const here = import.meta.dirname;

const AUTHORS = [
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

for (const author of AUTHORS) {
  const url = `https://www.knihovny.cz/api/v1/search?lookfor=${encodeURIComponent(author)}&type=Author&limit=60&sort=year&${fields}`;
  const data = await (await fetch(url)).json().catch(() => ({}));
  const recs = (data.records || []).filter((r) => (r.formats || []).some((f) => /BOOKS/.test(f)) && (r.isbns || []).length);
  let taken = 0;
  for (const r of recs) {
    if (taken >= 7) break;
    const primary = Object.keys(r.authors?.primary || {});
    if (!primary.length) continue;
    const mainTitle = String(r.title).split(/\s[:/=]\s?/)[0].trim();
    const key = fold(mainTitle);
    if (!key || key.length < 3 || seenTitles.has(key)) continue;
    const isbn = code(r.isbns[0]);
    if (!/^97[89]\d{10}$/.test(isbn)) continue;
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

writeFileSync(path.join(here, 'data', 'dataset.json'), JSON.stringify(books, null, 1));
console.log('books with covers:', books.length);
