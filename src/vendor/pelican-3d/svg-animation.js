// Compile the numeric portion of SVG SMIL once; geometry and transforms share
// the original illustration's poses and the same elapsed-time clock.
const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const PATH_FRAGMENT = /^[\s,MmZzLlHhVvCcSsQqTtAa]*$/;

function parseFrame(value, index) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new TypeError(`SVG animation values frame ${index} must be a non-empty string`);
  }
  const numbers = [];
  const fragments = [];
  let end = 0;
  for (const match of value.matchAll(NUMBER)) {
    fragments.push(value.slice(end, match.index));
    numbers.push(Number(match[0]));
    end = match.index + match[0].length;
  }
  fragments.push(value.slice(end));
  if (!numbers.length || numbers.some((number) => !Number.isFinite(number)) ||
      fragments.some((fragment) => !PATH_FRAGMENT.test(fragment))) {
    throw new TypeError(`SVG animation values frame ${index} contains invalid numeric or path tokens`);
  }
  return { numbers, fragments };
}

export function parseNumericFrames(values) {
  const input = typeof values === 'string' ? values.split(';') : values;
  if (!Array.isArray(input) || input.length < 2) {
    throw new TypeError('SVG animation values must contain at least two frames');
  }
  const parsed = input.map(parseFrame);
  const signature = (fragments) => fragments.map((fragment) => fragment.replace(/[\s,]/g, '')).join('|');
  const expected = signature(parsed[0].fragments);
  for (let index = 1; index < parsed.length; index += 1) {
    if (signature(parsed[index].fragments) !== expected) {
      throw new TypeError(`SVG animation values frame ${index} must match the first frame's path commands and numeric count`);
    }
  }
  // SVG permits an implicit separator before a negative number (e.g. 10-2).
  // Interpolation can turn that number positive, so make that separator explicit.
  const fragments = parsed[0].fragments.map((fragment, index) =>
    index > 0 && index < parsed[0].fragments.length - 1 && !fragment ? ' ' : fragment);
  return { frames: parsed.map(({ numbers }) => numbers), fragments };
}

function parseDuration(duration) {
  let seconds = duration;
  if (typeof duration === 'string') {
    const match = duration.match(/^(\d+(?:\.\d*)?|\.\d+)(ms|s)$/);
    seconds = match ? Number(match[1]) / (match[2] === 'ms' ? 1000 : 1) : NaN;
  }
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    throw new TypeError('SVG animation duration must be finite positive seconds or an SVG s/ms duration');
  }
  return seconds;
}

function parseKeyTimes(keyTimes, count) {
  if (keyTimes == null) return Array.from({ length: count }, (_, index) => index / (count - 1));
  const times = typeof keyTimes === 'string'
    ? keyTimes.split(';').map((value) => value.trim() ? Number(value) : NaN)
    : keyTimes;
  if (!Array.isArray(times) || times.length !== count || times[0] !== 0 || times.at(-1) !== 1 ||
      times.some((time, index) => typeof time !== 'number' || !Number.isFinite(time) ||
        time < 0 || time > 1 || (index > 0 && time <= times[index - 1]))) {
    throw new TypeError('SVG animation keyTimes must match the frames and increase strictly from 0 to 1');
  }
  return times.slice();
}

export function compileAnimation(values, duration, keyTimes) {
  const { frames, fragments } = parseNumericFrames(values);
  const seconds = parseDuration(duration);
  const times = parseKeyTimes(keyTimes, frames.length);

  function sample(time) {
    if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
      throw new TypeError('SVG animation time must be finite non-negative seconds');
    }
    const progress = (time % seconds) / seconds;
    let start = 0;
    let end = times.length - 1;
    while (end - start > 1) {
      const middle = (start + end) >> 1;
      if (times[middle] <= progress) start = middle;
      else end = middle;
    }
    const fraction = (progress - times[start]) / (times[end] - times[start]);
    return frames[start].map((number, index) => number + (frames[end][index] - number) * fraction);
  }

  function format(time) {
    const numbers = sample(time);
    return fragments[0] + numbers.map((number, index) => `${number}${fragments[index + 1]}`).join('');
  }

  return { sample, format };
}
