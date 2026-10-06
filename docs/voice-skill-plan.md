# Voice skill plan (work in progress)

Transcribe WhatsApp voice notes locally and explain Bahamian dialect in plain English, with hedged notes on tone and expression.

First user: the project owner. Everything runs locally. Audio never goes into git.

## Pipeline

```
voice note (.ogg) -> ffmpeg (16 kHz wav) -> whisper.cpp -> raw transcript
  -> dialect interpreter (local LLM + glossary + past corrections)
  -> plain English + slang explained + tone notes (hedged) + uncertain words marked
```

## Principles

- The original audio is never modified or moved.
- A translation is never shown without the raw transcript beside it. Uncertain words are marked.
- Tone and expression are guesses and are labeled as such, with a confidence level.
- Corrections you make are stored and reused (same idea as the file skill's memory).
- Audio contains other people's voices: keep it local, and get speaker consent before sharing or training on it.

## Stages

| Stage | What | Done when |
|---|---|---|
| 0. Baseline | Install tools, run Whisper on ~5 notes, write what was actually said, compare | We know how bad raw transcripts are and have a list of missed words |
| 1. Transcribe | `voice` skill transcribes a file/folder locally, with caching | A note goes in, a raw transcript comes out |
| 2. Interpreter | Local LLM + glossary gives plain English next to the transcript | Owner rates ~20 notes understandable |
| 3. Corrections | Fixes are stored and reused | A corrected phrase comes out right next time |
| 4. Tone | Hedged tone and expression notes | Notes are clearly labeled as guesses |
| 5. Training decision | Fine-tune only if stages 2-3 aren't enough and enough corrected audio exists | A deliberate yes/no |

## Why training is last

Research on a related dialect (Jamaican Patois) found Whisper large at ~89% word error rate, ~30% after fine-tuning on ~40 hours of labeled audio. Fine-tuning needs a lot of labeled audio, so we start with a glossary and corrections, which also create the labeled data later training would need.

Training on rented GPUs (e.g. vast.ai) means audio leaves this machine and sits on third-party hosts. Decide this deliberately at stage 5: only audio whose speakers consented, ideally the owner's own voice, and a provider/setup that fits the privacy rules above.

## Stage 0 checklist

1. Run `brew install ffmpeg whisper-cpp` (owner runs it).
2. Download a Whisper model (command to be confirmed after install).
3. Put 5-10 voice notes in `~/voice-samples/` (outside the repo) and, for each, a text file with the same name containing what was actually said.
4. Run the baseline and record the results here.

## Risks

- Fluent but wrong translations built on a wrong transcript.
- Tone/sarcasm is hard even for people.
- Other people's voices and consent.
- Whisper can hallucinate text on silence or noise.
- Dialect accuracy can only be judged on real notes, so tests with synthetic audio only prove the pipeline works.
