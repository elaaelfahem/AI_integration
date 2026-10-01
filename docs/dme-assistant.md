# DME assistant

The DME Assistant is a company-scoped sales copilot. Its request must include `user_question` and one company record from the validated pipeline. It explains the score, approved offer families, missing data, review restrictions, and suggested discovery questions.

The gateway provides a deterministic French response by default. Set `enable_ai: true` to request Flowise wording. Invalid, slow, or unavailable model output falls back automatically and cannot change source records, scores, RNE status, or approved offers.

Endpoint: `POST /webhook/dme/assistant`.
