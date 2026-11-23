import { app } from './app';
import { config } from './config';

app.listen(config.port, '0.0.0.0', () => {
  console.log(`TriageSync API listening on port ${config.port}`);
});
