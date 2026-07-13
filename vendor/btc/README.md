# Vendored: BTC-ISMIR19 (chord recognition inference)

Pinned snapshot of the inference subset of **BTC-ISMIR19** — Jonggwon Park et al.,
*A Bi-directional Transformer for Musical Chord Recognition* (ISMIR 2019).

- Upstream: https://github.com/jayg996/BTC-ISMIR19
- Pinned commit: see `COMMIT.txt`
- License: upstream `LICENSE` (MIT) — retained upstream; this is a verbatim code snapshot.

## Why vendored

The technical plan requires the chord model be **pinned**, not pulled live (repo-rot is the
flagged #1 risk). This directory holds only what inference needs; training scripts, CRF
model, TensorFlow logger, datasets, and figures are omitted.

Tracked source (verbatim from upstream):

    btc_model.py                 # BTC_model: bi-directional self-attention + softmax head
    run_config.yaml              # CQT + model hyperparameters (load-bearing — do not edit)
    utils/hparams.py             # YAML config loader
    utils/transformer_modules.py # attention layers
    utils/mir_eval_modules.py    # audio_file_to_features (CQT) + idx2voca_chord vocabulary

## Weights (NOT committed)

`weights/` is git-ignored. Stage the two pretrained checkpoints there out of band:

    weights/btc_model_large_voca.pt   # 170-chord "large vocabulary" head (default)
    weights/btc_model.pt              # 25-chord maj/min head

They ship in the upstream repo's `test/` directory; copy them in, or point
`BTCChordEngine(weights_path=...)` at wherever they live on the box.

## How it's used

`app/audio/deep_chord.py::BTCChordEngine` adds this directory to `sys.path` lazily (only
when the deep engine is actually constructed), loads the model onto `resolve_device(...)`,
reproduces the upstream featurization + inference loop, then maps the frame-wise chord
indices through `reduce_btc_label` + `frames_to_segments` into Tabit `DetectedSegment`s.
