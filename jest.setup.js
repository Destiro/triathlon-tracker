/* eslint-disable no-extend-native -- a test setup file is the one place to patch the locale defaults. */
// The tests check dates as text ("Sat, 7 Nov"), which depends on the machine's language. They expect New Zealand
// English, the owner's, so use it everywhere: otherwise they pass on this phone's locale and fail on CI's.
const LOCALE = 'en-NZ';

for (const method of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
  const original = Date.prototype[method];
  Date.prototype[method] = function (locale, options) {
    return original.call(this, locale ?? LOCALE, options);
  };
}
const numberOriginal = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function (locale, options) {
  return numberOriginal.call(this, locale ?? LOCALE, options);
};
