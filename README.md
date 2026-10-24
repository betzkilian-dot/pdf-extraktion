# PDF-PNG-Extraktion

Webseite, die aus PDF-, PNG- und JPG-Dateien den Text und die Bilder herauslöst. Ergebnis ist eine ZIP-Datei mit einem Ordner pro Datei: der Text als Markdown, die Bilder nach Seite nummeriert. Gescannte Seiten und Fotos werden per Texterkennung (Deutsch und Englisch) gelesen. Alles läuft im Browser, die Dateien verlassen das Gerät nicht.

Läuft in Chrome, Edge und Firefox sowie in Safari auf dem iPad (iPadOS 17 oder neuer).

**Zur Webseite:** https://betzkilian-dot.github.io/pdf-extraktion/

## Lokal starten

```
npx --yes http-server -p 8080 -c-1 .
```

Dann `http://localhost:8080/` öffnen. Ein Server ist nötig, weil die JavaScript-Module über `file://` nicht laden.

## Tests

Die Tests liegen nur in der lokalen Arbeitskopie, nicht in diesem Repository. `http://localhost:8080/tests.html` im Browser öffnen. Mit `tests.html?ocr=1` laufen zusätzlich die Tests mit echter Texterkennung (lädt beim ersten Mal ca. 10 MB Sprachdaten).

Ohne Browserfenster (Edge, Server muss laufen):

```
node tests/run-tests.mjs              # normale Tests
node tests/run-tests.mjs "?ocr=1" 300 # mit Texterkennung, max. 300 s
node tests/e2e.mjs <zielordner> <datei1> [datei2 …]   # Oberfläche durchspielen, ZIP landet im Zielordner
```

## Veröffentlichen

Die `.gitignore` ist eine Positivliste: Versioniert werden nur `index.html`, `style.css`, `js/` und `README.md`. Änderungen committen und mit `git push` hochladen, GitHub Pages aktualisiert die Seite nach etwa einer Minute.
