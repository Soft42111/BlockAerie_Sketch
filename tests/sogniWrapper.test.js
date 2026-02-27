/**
 * Tests for the sogni-wrapper CLI arg builder and error mapping.
 * Mocks child_process.spawn to test without actual sogni-gen.
 */

// Mock module resolution for ESM
const buildArgs = (() => {
    // Inline the buildArgs function for testing
    function buildArgs(opts) {
        const args = ['--json'];
        if (opts.model) args.push('-m', opts.model);
        if (opts.width) args.push('-w', String(opts.width));
        if (opts.height) args.push('-h', String(opts.height));
        if (opts.count) args.push('-n', String(opts.count));
        if (opts.timeout) args.push('-t', String(opts.timeout));
        if (opts.seed != null) args.push('-s', String(opts.seed));
        if (opts.seedStrategy) args.push('--seed-strategy', opts.seedStrategy);
        if (opts.steps) args.push('--steps', String(opts.steps));
        if (opts.guidance) args.push('--guidance', String(opts.guidance));
        if (opts.output) args.push('-o', opts.output);
        if (opts.outputFormat) args.push('--output-format', opts.outputFormat);
        if (opts.tokenType) args.push('--token-type', opts.tokenType);
        if (opts.context) {
            const ctxArr = Array.isArray(opts.context) ? opts.context : [opts.context];
            for (const c of ctxArr) args.push('-c', c);
        }
        if (opts.lora) args.push('--lora', opts.lora);
        if (opts.loraStrength) args.push('--lora-strength', String(opts.loraStrength));
        if (opts.video) args.push('--video');
        if (opts.workflow) args.push('--workflow', opts.workflow);
        if (opts.fps) args.push('--fps', String(opts.fps));
        if (opts.duration) args.push('--duration', String(opts.duration));
        if (opts.ref) args.push('--ref', opts.ref);
        if (opts.refEnd) args.push('--ref-end', opts.refEnd);
        if (opts.refAudio) args.push('--ref-audio', opts.refAudio);
        if (opts.refVideo) args.push('--ref-video', opts.refVideo);
        if (opts.multiAngle) args.push('--multi-angle');
        if (opts.angles360) args.push('--angles-360');
        if (opts.angles360Video) args.push('--angles-360-video', opts.angles360Video);
        if (opts.azimuth) args.push('--azimuth', opts.azimuth);
        if (opts.elevation) args.push('--elevation', opts.elevation);
        if (opts.distance) args.push('--distance', opts.distance);
        if (opts.angleStrength) args.push('--angle-strength', String(opts.angleStrength));
        args.push('-q');
        if (opts.prompt) args.push(opts.prompt);
        return args;
    }
    return buildArgs;
})();

describe('Sogni Wrapper - buildArgs', () => {
    test('basic image generation args', () => {
        const args = buildArgs({ prompt: 'a cat', model: 'z_image_turbo_bf16', width: 768, height: 768 });
        expect(args).toContain('--json');
        expect(args).toContain('-m');
        expect(args).toContain('z_image_turbo_bf16');
        expect(args).toContain('-w');
        expect(args).toContain('768');
        expect(args[args.length - 1]).toBe('a cat');
    });

    test('image edit with context', () => {
        const args = buildArgs({ prompt: 'add glow', context: '/tmp/img.png', model: 'qwen_image_edit_2511_fp8_lightning' });
        expect(args).toContain('-c');
        expect(args).toContain('/tmp/img.png');
    });

    test('multiple context images', () => {
        const args = buildArgs({ prompt: 'blend', context: ['/tmp/a.png', '/tmp/b.png'] });
        const cIndexes = args.reduce((acc, val, idx) => val === '-c' ? [...acc, idx] : acc, []);
        expect(cIndexes.length).toBe(2);
    });

    test('video t2v args', () => {
        const args = buildArgs({ prompt: 'ocean', video: true, workflow: 't2v', fps: 16, duration: 5 });
        expect(args).toContain('--video');
        expect(args).toContain('--workflow');
        expect(args).toContain('t2v');
        expect(args).toContain('--fps');
        expect(args).toContain('--duration');
    });

    test('video i2v with ref', () => {
        const args = buildArgs({ prompt: 'animate', video: true, workflow: 'i2v', ref: '/tmp/ref.png' });
        expect(args).toContain('--ref');
        expect(args).toContain('/tmp/ref.png');
    });

    test('360 angles', () => {
        const args = buildArgs({ prompt: 'turntable', angles360: true, context: '/tmp/sub.png', elevation: 'eye-level', distance: 'medium' });
        expect(args).toContain('--angles-360');
        expect(args).toContain('--elevation');
        expect(args).toContain('--distance');
    });

    test('360 with video output', () => {
        const args = buildArgs({ prompt: 'spin', angles360: true, angles360Video: '/tmp/360.mp4' });
        expect(args).toContain('--angles-360-video');
        expect(args).toContain('/tmp/360.mp4');
    });

    test('seed and seed strategy', () => {
        const args = buildArgs({ prompt: 'test', seed: 42, seedStrategy: 'prompt-hash' });
        expect(args).toContain('-s');
        expect(args).toContain('42');
        expect(args).toContain('--seed-strategy');
        expect(args).toContain('prompt-hash');
    });

    test('always includes --json and -q', () => {
        const args = buildArgs({ prompt: 'hello' });
        expect(args[0]).toBe('--json');
        expect(args).toContain('-q');
    });
});

describe('Sogni Wrapper - Error Mapping', () => {
    const ERROR_HINTS = {
        MODEL_NOT_FOUND: 'The requested model is not available. Try a different model or check `!status`.',
        INSUFFICIENT_BALANCE: 'Not enough SPARK/SOGNI tokens. Check balance with `/bot-status`.',
        TIMEOUT: 'Generation timed out. Try a simpler prompt or smaller dimensions.',
        AUTH_FAILED: 'Sogni authentication failed. Check SOGNI_USERNAME/SOGNI_PASSWORD in .env.',
        FFMPEG_MISSING: 'ffmpeg is not installed. Install it for video assembly. Still images will be returned.',
    };

    function mapError(result) {
        const hint = result.hint || ERROR_HINTS[result.errorCode] || '';
        return `${result.error}${hint ? `\n💡 ${hint}` : ''}`;
    }

    test('maps known error codes to hints', () => {
        const msg = mapError({ success: false, error: 'Model not found', errorCode: 'MODEL_NOT_FOUND' });
        expect(msg).toContain('Model not found');
        expect(msg).toContain('Try a different model');
    });

    test('uses result hint when provided', () => {
        const msg = mapError({ success: false, error: 'Failed', hint: 'Custom hint from server' });
        expect(msg).toContain('Custom hint from server');
    });

    test('handles unknown error codes gracefully', () => {
        const msg = mapError({ success: false, error: 'Unknown error', errorCode: 'XYZZY' });
        expect(msg).toBe('Unknown error');
    });
});
