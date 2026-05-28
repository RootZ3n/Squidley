# Cloud Models and Providers

## What is a Cloud Model?

A cloud model runs on a company's servers. You send your text over the internet,
they process it, and send back a response. Cloud models are usually more
powerful than local models, but they cost money and your data leaves your
machine.

## Providers

A provider is a company that runs AI models on their servers. Examples:

- **OpenAI** — makes GPT-4 and other models
- **Anthropic** — makes Claude
- **OpenRouter** — a gateway to many models from different providers
- **Google** — makes Gemini

Each provider has different models, pricing, and policies.

## API Keys

An API key is a password that lets Peh talk to a provider's servers. You
get one by creating an account with a provider. Important:

- API keys cost money per use (you pay for each request)
- Keep your key secret — anyone with it can use your account
- Do not put API keys in code that others can see
- Peh uses environment variables for API keys (not browser storage)

## Cost

Cloud calls cost money based on the number of tokens used. A typical
conversation might cost a few cents. Longer conversations cost more. Peh
will warn you about costs before making cloud calls.

## Check Your Understanding

- What data leaves your machine when you use a cloud model?
- What is an API key and why should you keep it secret?
- What determines how much a cloud call costs?
