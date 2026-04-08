import { describe, it } from 'node:test';
import assert from 'node:assert';
import { searchYouTubeVideos } from '../lib/fetchers/youtube.js';

describe('YouTube', () => {
  it('isYouTubeUrl logic', async () => {
    // Test that transcribeVideo rejects non-YouTube URLs
    const { transcribeVideo } = await import('../lib/fetchers/youtube.js');
    assert.throws(() => transcribeVideo('https://example.com'), /Not a YouTube URL/);
  });

  it('searchYouTubeVideos returns array', () => {
    // This makes a real network call but should not crash
    const results = searchYouTubeVideos('test_nonexistent_person_xyz', 2);
    assert.ok(Array.isArray(results));
  });
});
