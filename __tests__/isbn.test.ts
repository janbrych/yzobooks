import {
  cleanIsbn,
  isValidIsbn10,
  isValidIsbn13,
  convertIsbn10To13,
} from '../src/lib/bookIdentification';

describe('ISBN Utilities & Validation', () => {
  test('cleanIsbn removes hyphens, spaces and formats correctly', () => {
    expect(cleanIsbn(' 978-0-4515-2493-5 ')).toBe('9780451524935');
    expect(cleanIsbn('0-451-52493-4')).toBe('0451524934');
    expect(cleanIsbn('0-306-40615-2')).toBe('0306406152');
  });

  test('isValidIsbn10 verifies valid and invalid ISBN-10 numbers', () => {
    expect(isValidIsbn10('0451524934')).toBe(true);
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn10('0000000000')).toBe(true);
    expect(isValidIsbn10('1234567890')).toBe(false);
  });

  test('isValidIsbn13 verifies valid and invalid ISBN-13 numbers', () => {
    expect(isValidIsbn13('9780451524935')).toBe(true);
    expect(isValidIsbn13('9780441172719')).toBe(true);
    expect(isValidIsbn13('9780000000000')).toBe(false);
  });

  test('convertIsbn10To13 converts valid ISBN-10 to standard ISBN-13', () => {
    expect(convertIsbn10To13('0451524934')).toBe('9780451524935');
    expect(convertIsbn10To13('0306406152')).toBe('9780306406157');
  });
});
