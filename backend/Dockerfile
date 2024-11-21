FROM python:3.12

WORKDIR /pyspur

COPY requirements.txt .

RUN pip install -r requirements.txt

# CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
