# html taplist generator

## howto

- Review and update `src/assets/taplist.csv`. Note: text values (e.g. link and description) should be "surrounded with quotation marks". Link field could be empty.
- `python src/main.py`
- The brand new web-page is ready, check it for mistakes (checkout the debug section below).
- Push updated taplist and `docs/index.html` to repo to deploy them
- Wait for few minutes
- You're awesome

## debug

- `python src/main.py`
- `python3 -m http.server`
- Visit `http://bs-local.com:8000`
