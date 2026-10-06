// Imported first by the test file. ES module imports are evaluated in order, so
// this runs before db.js reads DB_PATH, keeping tests off the real database.
process.env.DB_PATH = ':memory:';
delete process.env.GEMINI_API_KEY;
delete process.env.TAVILY_API_KEY;
