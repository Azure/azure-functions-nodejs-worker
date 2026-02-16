const { app } = require('@azure/functions');

app.http('PipelineDemo', {
    methods: ['GET', 'POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const requestId = crypto.randomUUID();
        const shouldFail = request.query.get('fail') === 'true';
        const logCount = parseInt(request.query.get('logs') || '5', 10);

        // ── Generate user logs (these go to Blob Storage when pipeline is enabled) ──
        context.log(`[${requestId}] PipelineDemo invoked at ${new Date().toISOString()}`);
        context.log(`[${requestId}] Method: ${request.method}, URL: ${request.url}`);

        for (let i = 1; i <= logCount; i++) {
            context.log(`[${requestId}] Processing step ${i}/${logCount} — payload chunk #${i}`);
        }

        // Simulate some async work
        await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 200));

        // ── Simulate failure if requested ──
        if (shouldFail) {
            context.log(`[${requestId}] Simulating failure...`);
            throw new Error(`Simulated error for invocation ${requestId}`);
        }

        context.log(`[${requestId}] Completed successfully`);

        return {
            status: 200,
            jsonBody: {
                message: 'PipelineDemo completed',
                requestId,
                logCount,
                timestamp: new Date().toISOString(),
                pipelineNote: 'User logs were routed to Blob Storage. Check the function-logs container in Azurite.',
            },
        };
    },
});
