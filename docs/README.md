# docs/

| File | What |
|---|---|
| [quick-guide.en.md](quick-guide.en.md) | How to use it: set up one repository or a workspace of services, the ticket flows, two developers on one ticket, reopening |
| [quick-guide.es.md](quick-guide.es.md) | The same, in Spanish |
| `img/*.svg` | The timelines the guides show (generated) |

The Markdown is the source. The timelines and a PDF of each guide are generated:

```bash
python3 docs/build/build_docs.py          # timelines + PDF (Edge or Chrome headless prints it)
```
