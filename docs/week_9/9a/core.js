(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.TRPCore = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const VERSION = 'ami-manual-1.6.2-9a-v1';
  const BINS = [
    { label: 'More than 0.5 s before the annotated end', test: n => n < -0.5 },
    { label: 'Within 0.5 s before the annotated end', test: n => n >= -0.5 && n < 0 },
    { label: 'Within 0.5 s after the annotated end', test: n => n >= 0 && n <= 0.5 },
    { label: 'More than 0.5 s after the annotated end', test: n => n > 0.5 }
  ];
  function offset(mark, clip) {
    return mark === null ? null : Math.round((mark - clip.turnEnd) * 100) / 100;
  }
  function classify(value) {
    if (value === null) return 'No mark';
    return BINS.find(bin => bin.test(value)).label;
  }
  function validateSubmission(value, clips) {
    if (!value || value.version !== VERSION || typeof value.id !== 'string' ||
        !/^[a-zA-Z0-9-]{8,80}$/.test(value.id) || !Array.isArray(value.marks) ||
        value.marks.length !== clips.length) return false;
    return clips.every((clip, i) => value.marks[i] === null ||
      (typeof value.marks[i] === 'number' && Number.isFinite(value.marks[i]) &&
       value.marks[i] >= 0 && value.marks[i] <= clip.duration + 0.1));
  }
  function summarize(submissions, clips) {
    const counts = BINS.map(() => 0);
    let missing = 0;
    for (const submission of submissions) {
      if (!validateSubmission(submission, clips)) continue;
      submission.marks.forEach((mark, i) => {
        const value = offset(mark, clips[i]);
        if (value === null) missing++;
        else counts[BINS.findIndex(bin => bin.test(value))]++;
      });
    }
    return { counts, missing };
  }
  return { VERSION, BINS, offset, classify, validateSubmission, summarize };
});
