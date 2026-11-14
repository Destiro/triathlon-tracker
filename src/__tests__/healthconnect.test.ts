import { HISTORY_PERMISSION, MANIFEST_PERMISSIONS, READ_TYPES } from '../healthconnect';

const appJson = require('../../app.json') as { expo: { android: { permissions?: string[] }; plugins: unknown[] } };

describe('Health Connect permissions', () => {
  it('declares in app.json every permission the app asks for, and nothing else', () => {
    const declared = (appJson.expo.android.permissions ?? []).filter((p) => p.startsWith('android.permission.health.'));
    expect([...declared].sort()).toEqual([...MANIFEST_PERMISSIONS].sort());
  });

  it('asks for each kind of data once, and for older-than-30-days history', () => {
    const types = READ_TYPES.map((t) => t.recordType);
    expect(new Set(types).size).toBe(types.length);
    expect(MANIFEST_PERMISSIONS).toContain(HISTORY_PERMISSION);
  });

  it('uses permission names in the form Android expects', () => {
    for (const p of MANIFEST_PERMISSIONS) expect(p).toMatch(/^android\.permission\.health\.READ_[A-Z0-9_]+$/);
  });

  it('adds the library and a minimum Android version of 26, which Health Connect needs', () => {
    expect(appJson.expo.plugins).toContain('react-native-health-connect');
    expect(JSON.stringify(appJson.expo.plugins)).toContain('"minSdkVersion":26');
  });
});
