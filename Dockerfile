FROM python:3.13-slim

# Bypass buffering in logs
ENV PYTHONUNBUFFERED=1

# Install ffmpeg using apt-get since Render uses standard Debian/Ubuntu containers
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# Set up the working directory
WORKDIR /app

# Install dependencies required by the bot
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy all the rest of the files into the container
COPY . .

# Run the python script
CMD ["python", "main.py"]
