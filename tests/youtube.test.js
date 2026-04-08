import { describe, it } from 'node:test';
import assert from 'node:assert';
import { searchYouTubeVideos, isYouTubeUrl } from '../lib/fetchers/youtube.js';

describe('YouTube', () => {
  it('isYouTubeUrl accepts valid YouTube URLs', () => {
    assert.ok(isYouTubeUrl('https://www.youtube.com/watch?v=abc123'));
    assert.ok(isYouTubeUrl('https://youtube.com/watch?v=abc123'));
    assert.ok(isYouTubeUrl('https://youtu.be/abc123'));
    assert.ok(isYouTubeUrl('https://www.youtube.com/shorts/abc123'));
  });

  it('isYouTubeUrl rejects non-YouTube URLs', () => {
    assert.ok(!isYouTubeUrl('https://example.com'));
    assert.ok(!isYouTubeUrl('https://notyoutube.com/watch?v=abc'));
    assert.ok(!isYouTubeUrl('not-a-url'));
    assert.ok(!isYouTubeUrl(''));
    assert.ok(!isYouTubeUrl('https://youtube.com/channel/xyz'));
  });

  it('transcribeVideo rejects non-YouTube URLs', async () => {
    const { transcribeVideo } = await import('../lib/fetchers/youtube.js');
    assert.throws(() => transcribeVideo('https://example.com'), /Not a YouTube URL/);
  });

  it('searchYouTubeVideos returns array', () => {
    // This makes a real network call but should not crash
    const results = searchYouTubeVideos('test_nonexistent_person_xyz', 2);
    assert.ok(Array.isArray(results));
  });
});
