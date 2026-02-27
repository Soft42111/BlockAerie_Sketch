/**
 * Simple test suite for the prompt generator
 * Run with: node tests/promptGenerator.test.js
 */

import { generatePrompt, validatePrompt } from '../src/promptGenerator.js';

// Test data
const testAnswers = {
    avatarType: 'male',
    visualStyle: 'cyberpunk',
    mood: 'visionary',
    extraDetails: 'neon blue and purple colors, holographic background',
};

async function runTests() {
    console.log('🧪 Running Prompt Generator Tests...\n');

    let passed = 0;
    let failed = 0;

    // Test 1: Generate prompt
    try {
        console.log('Test 1: Generate prompt with valid answers');
        const prompt = await generatePrompt(testAnswers);

        if (prompt && prompt.length > 50) {
            console.log('✅ PASSED: Prompt generated successfully');
            console.log(`   Length: ${prompt.length} characters`);
            passed++;
        } else {
            console.log('❌ FAILED: Prompt too short or empty');
            failed++;
        }
    } catch (error) {
        console.log('❌ FAILED: Error generating prompt:', error.message);
        failed++;
    }

    console.log('');

    // Test 2: Validate web3/NFT keywords
    try {
        console.log('Test 2: Validate web3/NFT keywords in prompt');
        const prompt = await generatePrompt(testAnswers);
        const isValid = validatePrompt(prompt);

        if (isValid) {
            console.log('✅ PASSED: Prompt contains web3/NFT keywords');
            passed++;
        } else {
            console.log('❌ FAILED: Prompt missing web3/NFT keywords');
            console.log(`   Prompt: ${prompt.substring(0, 100)}...`);
            failed++;
        }
    } catch (error) {
        console.log('❌ FAILED: Error validating prompt:', error.message);
        failed++;
    }

    console.log('');

    // Test 3: Generate with minimal answers
    try {
        console.log('Test 3: Generate prompt with minimal answers');
        const minimalAnswers = {
            avatarType: 'abstract',
            visualStyle: 'nft-art',
            mood: 'mysterious',
            extraDetails: 'none',
        };

        const prompt = await generatePrompt(minimalAnswers);

        if (prompt && prompt.length > 50) {
            console.log('✅ PASSED: Prompt generated with minimal answers');
            passed++;
        } else {
            console.log('❌ FAILED: Failed to generate with minimal answers');
            failed++;
        }
    } catch (error) {
        console.log('❌ FAILED: Error with minimal answers:', error.message);
        failed++;
    }

    console.log('');

    // Test 4: Check for CRISPE elements
    try {
        console.log('Test 4: Check for CRISPE framework elements');
        const prompt = await generatePrompt(testAnswers);
        const lowerPrompt = prompt.toLowerCase();

        // Check for technical details (Parameters)
        const hasTechnicalDetails =
            lowerPrompt.includes('8k') ||
            lowerPrompt.includes('detailed') ||
            lowerPrompt.includes('resolution');

        // Check for quality constraints (Evaluation)
        const hasQualityConstraints =
            lowerPrompt.includes('sharp') ||
            lowerPrompt.includes('focus') ||
            lowerPrompt.includes('high detail');

        if (hasTechnicalDetails && hasQualityConstraints) {
            console.log('✅ PASSED: Prompt includes CRISPE elements');
            passed++;
        } else {
            console.log('❌ FAILED: Missing CRISPE elements');
            console.log(`   Technical details: ${hasTechnicalDetails}`);
            console.log(`   Quality constraints: ${hasQualityConstraints}`);
            failed++;
        }
    } catch (error) {
        console.log('❌ FAILED: Error checking CRISPE elements:', error.message);
        failed++;
    }

    console.log('');
    console.log('═══════════════════════════════════════');
    console.log(`📊 Test Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════');

    if (failed === 0) {
        console.log('🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('⚠️ Some tests failed');
        process.exit(1);
    }
}

// Run tests
runTests().catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
});
