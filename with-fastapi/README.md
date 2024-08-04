- clone the example
- create and activate a new virtual environment:

```bash
# Create a virtual environment
python -m venv venv

# Active the virtual environment (Windows)
.\venv\Scripts\activate.bat

# Active the virtual environment (Linux)
source ./venv/bin/activate
```

- install the dependencies:

```bash
pip install -r requirements.txt
```

- run the application using:

```bash
DATABASE_URL="postgresql://neondb_owner:...@ep-...us-east-1.aws.neon.tech/neondb?sslmode=require"
```

```bash
fastapi dev main.py
```
