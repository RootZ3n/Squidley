# Tokens, Context Windows, and Cost

## Tokens

Models do not read whole sentences at once. They break text into small pieces
called tokens. A token is roughly one word, but some words get split into
multiple tokens. The word "hello" is one token. The word "unbelievable" might
be three tokens.

Tokens matter for two reasons:
1. Models have a maximum number of tokens they can process at once
2. Cloud providers charge per token

## Context Window

The context window is the maximum amount of text a model can read and remember
at once. Think of it as the model's short-term memory. If your conversation
gets too long, the model starts losing track of the beginning.

- A 4K context window holds about 3,000 words
- A 128K context window holds about the length of a short book

## Cost

Cloud providers charge based on tokens:
- **Input tokens:** the text you send (your prompt + conversation history)
- **Output tokens:** the text the model generates

Longer conversations cost more because the model processes more tokens. Local
models are free — there are no per-token charges.

## Check Your Understanding

- What is a token?
- Why do longer conversations cost more?
- What happens when you exceed the context window?
