import { extractISBN } from '../src/lib/scanner';

function runTests() {
  console.log('Running scanner tests...');

  // 1. ISBN 13 test
  const text1 = 'Kniha Harry Potter ISBN-13: 978-0-7475-3269-9 Nakladatelství';
  const isbn1 = extractISBN(text1);
  if (isbn1 !== '9780747532699') {
    throw new Error(`Expected 9780747532699, got ${isbn1}`);
  }

  // 2. ISBN 10 test
  const text2 = 'ISBN 0-7475-3269-9 Text';
  const isbn2 = extractISBN(text2);
  if (isbn2 !== '0747532699') {
    throw new Error(`Expected 0747532699, got ${isbn2}`);
  }

  // 3. No ISBN test
  const text3 = 'Random title without any digits';
  const isbn3 = extractISBN(text3);
  if (isbn3 !== null) {
    throw new Error(`Expected null, got ${isbn3}`);
  }

  console.log('All scanner unit tests passed successfully!');
}

runTests();
