import { voiceErrorMessage, withTranscript } from '../coach/voice';

test('what you say goes after what you typed, with one space', () => {
  expect(withTranscript('', 'how did my week go')).toBe('how did my week go');
  expect(withTranscript('Quick one: ', 'is my run still on')).toBe('Quick one: is my run still on');
  expect(withTranscript('Hi', '  ')).toBe('Hi');
});

test('recognition errors read as something you can act on, and stopping it yourself says nothing', () => {
  expect(voiceErrorMessage('aborted')).toBeNull();
  expect(voiceErrorMessage('no-speech')).toMatch(/Didn’t catch that/);
  expect(voiceErrorMessage('not-allowed')).toMatch(/Android settings/);
  expect(voiceErrorMessage('service-not-allowed')).toMatch(/Google app/);
  expect(voiceErrorMessage('network')).toMatch(/connection/);
  expect(voiceErrorMessage('unknown')).toMatch(/type instead/);
});
