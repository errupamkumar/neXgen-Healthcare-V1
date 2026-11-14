# neXgen for Doctors — presentation video

The video is generated from the live, animated presentation at **`/doctors-video`**
(`src/components/presentation/DoctorPresentation.tsx`). Nothing is stock footage:
every frame is the app's own React stage, recorded frame by frame.

## Output (in `public/media/`)

| File | What it is |
|---|---|
| `nexgen-for-doctors.mp4` | 1920×1080, 30 fps, H.264 + AAC, with English and Hindi subtitle tracks (switch in any player) |
| `docs/video/nexgen-for-doctors-hindi-captions.mp4` | Same video with Hindi captions burned in — for WhatsApp / social sharing (kept out of `public/` so it is not deployed) |
| `nexgen-for-doctors-narration.m4a` | Voice-over + soft background pad; the live `/doctors-video` page plays it in sync |
| `nexgen-for-doctors.en.vtt`, `.hi.vtt` | Subtitles used by the website's video player |
| `nexgen-for-doctors-poster.jpg` | Poster frame |
| `narration-timing.json` | Scene timings measured from the real narration (the presentation reads it) |

## Regenerate

1. Start the app: `npm run dev` (port 3001).
2. Run:

```bash
FFMPEG="C:/path/to/ffmpeg.exe" node scripts/doctor-video/build.mjs --workers 8 --voice Ravi
```

Options: `--base http://localhost:3001`, `--fps 30`, `--voice Ravi|Heera`, `--workers N`, `--skip-hindi`.

Requirements: Windows (OneCore voice via `tts.ps1`), Google Chrome, ffmpeg, and
`playwright-core` (resolved from this project or the sibling `nexgen-hms`).

## Editing the script

- Spoken text: `src/components/presentation/narration.json`
  - `tts` — what the voice reads (spell out "fifty rupees", "O P D", etc.)
  - `en` / `hi` — subtitle and caption text
- On-screen headlines, bullets and visuals: `COPY` and the scene components in
  `DoctorPresentation.tsx`.

Scene lengths follow the narration automatically — re-run the build after any change.

## Hindi voice-over

Only English-India voices (Heera, Ravi) ship with Windows. To produce a Hindi-narrated
version, install a Hindi voice (Settings → Time & language → Speech → Add voices →
Hindi), put Hindi text in each scene's `tts` field, and run with `--voice Kalpana`
(or the installed voice's name). A recorded human voice can also replace
`nexgen-for-doctors-narration.m4a` before the encode step.

The revenue scene is an **illustrative example** (₹400 fee × 4 extra patients/day ×
26 days) and is labelled as such on screen and in the narration.
