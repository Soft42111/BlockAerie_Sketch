import dotenv from 'dotenv';
dotenv.config({ path: '.env.dashboard' });

const username = 'admin';
const password = 'admin123';

console.log('Username input:', username);
console.log('Password input:', password);
console.log('DASHBOARD_USERNAME:', process.env.DASHBOARD_USERNAME);
console.log('DASHBOARD_PASSWORD:', process.env.DASHBOARD_PASSWORD);

const adminUser = process.env.DASHBOARD_USERNAME;
const adminPass = process.env.DASHBOARD_PASSWORD;

console.log('\nComparison:');
console.log('  username === adminUser:', username === adminUser);
console.log('  password === adminPass:', password === adminPass);
console.log('  password === admin123:', password === 'admin123');
console.log('  username === admin:', username === 'admin');

if ((username === adminUser || username === 'admin') && 
    (password === adminPass || password === 'admin123')) {
    console.log('\n✅ LOGIN WOULD SUCCEED');
} else {
    console.log('\n❌ LOGIN WOULD FAIL');
}
