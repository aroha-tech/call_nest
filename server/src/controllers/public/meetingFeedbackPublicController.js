import * as settingsService from '../../services/tenant/meetingDefaultEmailSettingsService.js';

function htmlPage(title, body) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f6f7fb; margin: 0; padding: 20px; }
    .card { max-width: 640px; margin: 32px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
    h1 { margin-top: 0; font-size: 22px; }
    label { display: block; margin-top: 12px; font-weight: 600; }
    textarea, select, button { width: 100%; padding: 10px; margin-top: 6px; border-radius: 8px; border: 1px solid #d1d5db; box-sizing: border-box; }
    button { background: #4f46e5; color: #fff; border: none; cursor: pointer; font-weight: 600; }
    .muted { color: #6b7280; font-size: 14px; }
  </style>
</head>
<body><div class="card">${body}</div></body>
</html>`;
}

export async function viewForm(req, res, next) {
  try {
    const row = await settingsService.getFeedbackRequestByToken(req.params.token);
    if (!row) return res.status(404).send(htmlPage('Feedback not found', '<h1>Feedback link is invalid</h1>'));
    if (row.submitted_at) {
      return res.send(htmlPage('Feedback submitted', '<h1>Thank you</h1><p>Your feedback is already submitted.</p>'));
    }
    const form = `
      <h1>Meeting Feedback</h1>
      <p class="muted">Meeting: <strong>${row.title || 'Meeting'}</strong></p>
      <form method="post">
        <label for="rating">Rating</label>
        <select id="rating" name="rating" required>
          <option value="">Select</option>
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - Average</option>
          <option value="2">2 - Poor</option>
          <option value="1">1 - Very poor</option>
        </select>
        <label for="feedback_text">Comments</label>
        <textarea id="feedback_text" name="feedback_text" rows="5" placeholder="Share your feedback"></textarea>
        <button type="submit">Submit feedback</button>
      </form>`;
    return res.send(htmlPage('Meeting feedback', form));
  } catch (e) {
    return next(e);
  }
}

export async function submit(req, res, next) {
  try {
    await settingsService.submitFeedbackByToken(req.params.token, req.body || {});
    return res.send(htmlPage('Feedback submitted', '<h1>Thank you</h1><p>Your feedback has been submitted.</p>'));
  } catch (e) {
    if ((req.headers.accept || '').includes('application/json')) {
      return next(e);
    }
    return res.status(e.status || 400).send(htmlPage('Unable to submit', `<h1>Unable to submit feedback</h1><p>${e.message}</p>`));
  }
}
