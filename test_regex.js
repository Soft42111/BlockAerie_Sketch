const slurs = ['yellowman', 'yellow']; // Simulating potential list
const contentSafe = 'yellow';
const contentBad = 'yellowman';

function check(text, slurList) {
    console.log(`Checking text: "${text}"`);
    for (const slur of slurList) {
        if (!slur) continue;
        const escapedSlur = slur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedSlur}\\b`, 'i');

        const match = regex.test(text.toLowerCase());
        console.log(`  vs Slur "${slur}" -> Match? ${match}`);
    }
}

console.log('--- Test 1: Slur list has ONLY "yellowman" ---');
check('This is a yellow car', ['yellowman']);

console.log('\n--- Test 2: Slur list has "yellow" ---');
check('This is a yellow car', ['yellow']);

console.log('\n--- Test 3: Mixed content "yellowman" ---');
check('Look at that yellowman', ['yellowman']);
