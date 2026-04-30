import { Telegraf } from 'telegraf';
// Use a fake token that looks real enough to pass initial validation but will fail auth
const bot = new Telegraf('123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11');
console.log('before launch');
const timeout = setTimeout(() => {
  console.log('launch did not resolve within 5 seconds - it blocks');
  process.exit(0);
}, 5000);
try {
  await bot.launch();
  clearTimeout(timeout);
  console.log('launch resolved');
} catch (e) {
  clearTimeout(timeout);
  console.log('launch rejected:', e.message);
  process.exit(0);
}
