FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Gli strumenti di compilazione servono solo se per l'architettura del NAS (es. ARM)
# manca qualche pacchetto precompilato; vengono rimossi subito dopo.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential libffi-dev libssl-dev \
 && pip install pymobiledevice3==11.63.1 \
 && apt-get purge -y build-essential libffi-dev libssl-dev \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backup.py /app/backup.py

ENTRYPOINT ["python", "/app/backup.py"]
CMD ["loop"]
