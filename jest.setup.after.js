// Tests that render the whole app wait for screens to appear, and a shared CI runner can take longer than the default
// second to draw the first one.
const { configure } = require('@testing-library/react-native');

configure({ asyncUtilTimeout: 10000 });
