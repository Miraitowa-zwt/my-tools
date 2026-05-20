export function userError(message) {
  const error = new Error(message);
  error.userMessage = message;
  return error;
}
