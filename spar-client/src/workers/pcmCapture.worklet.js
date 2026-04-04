/* global AudioWorkletProcessor, registerProcessor, sampleRate */

const DEFAULT_TARGET_SAMPLE_RATE = 16000;
const DEFAULT_CHUNK_DURATION_MS = 80;

function clampSample(sample) {
  if (sample > 1) {
    return 1;
  }

  if (sample < -1) {
    return -1;
  }

  return sample;
}

function downsampleBuffer(inputBuffer, inputSampleRate, targetSampleRate) {
  if (!inputBuffer.length) {
    return new Int16Array(0);
  }

  if (targetSampleRate === inputSampleRate) {
    const output = new Int16Array(inputBuffer.length);

    for (let index = 0; index < inputBuffer.length; index += 1) {
      const sample = clampSample(inputBuffer[index]);
      output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }

    return output;
  }

  const sampleRateRatio = inputSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(inputBuffer.length / sampleRateRatio));
  const output = new Int16Array(outputLength);
  let outputOffset = 0;
  let inputOffset = 0;

  while (outputOffset < outputLength) {
    const nextInputOffset = Math.min(
      inputBuffer.length,
      Math.round((outputOffset + 1) * sampleRateRatio)
    );

    let accumulator = 0;
    let count = 0;
    for (let index = inputOffset; index < nextInputOffset; index += 1) {
      accumulator += inputBuffer[index];
      count += 1;
    }

    const averagedSample = count > 0 ? accumulator / count : inputBuffer[inputOffset] || 0;
    const clampedSample = clampSample(averagedSample);
    output[outputOffset] = clampedSample < 0 ? clampedSample * 0x8000 : clampedSample * 0x7fff;
    outputOffset += 1;
    inputOffset = nextInputOffset;
  }

  return output;
}

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const processorOptions = options?.processorOptions || {};
    this.targetSampleRate = processorOptions.targetSampleRate || DEFAULT_TARGET_SAMPLE_RATE;
    this.chunkDurationMs = processorOptions.chunkDurationMs || DEFAULT_CHUNK_DURATION_MS;
    this.chunkSize = Math.max(1, Math.round(this.targetSampleRate * (this.chunkDurationMs / 1000)));
    this.inputBuffer = [];
  }

  process(inputs) {
    const inputChannel = inputs[0]?.[0];
    if (!inputChannel?.length) {
      return true;
    }

    for (let index = 0; index < inputChannel.length; index += 1) {
      this.inputBuffer.push(inputChannel[index]);
    }

    const requiredInputLength = Math.max(
      inputChannel.length,
      Math.ceil(this.chunkSize * (sampleRate / this.targetSampleRate))
    );

    while (this.inputBuffer.length >= requiredInputLength) {
      const bufferSlice = this.inputBuffer.splice(0, requiredInputLength);
      const pcmChunk = downsampleBuffer(bufferSlice, sampleRate, this.targetSampleRate);
      if (pcmChunk.length > 0) {
        this.port.postMessage(pcmChunk.buffer, [pcmChunk.buffer]);
      }
    }

    return true;
  }
}

registerProcessor('pcm-capture-processor', PcmCaptureProcessor);
