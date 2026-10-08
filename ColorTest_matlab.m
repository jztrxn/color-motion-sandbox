%% Motion-Based Color Encoding Demo: Pixel-wise Speed Version
% Hue -> motion direction
% Saturation/chroma -> motion speed
% Original image stays static; local luminance motion is added on top
% This version does NOT require rgb2lab or hann from MATLAB toolboxes

clear; clc; close all;

%% ---------------- USER SETTINGS ----------------

imageFile = 'ishihara12_1.png';   % change this to your image name

blockSize = 36;                 % local motion window size
nFrames   = 120;                % number of animation frames
fps       = 30;                 % frames per second

spatialFreq = 2;                % grating cycles per block

minTemporalFreq = 0.2;          % slowest motion for low saturation
maxTemporalFreq = 5.0;          % fastest motion for high saturation

maxMotionContrast = 0.30;       % overall visibility of luminance grating
chromaGamma = 0.6;              % <1 makes weak saturation differences more visible

saveMovie = true;
movieName = 'pixelwise_motion_speed_color_encoding_demo.mp4';

%% ---------------- READ IMAGE ----------------

img = imread(imageFile);
img = im2double(img);

if size(img,3) == 1
    img = repmat(img, [1 1 3]);
end

[H, W, ~] = size(img);

%% ---------------- RGB TO CIELAB ----------------

labImg = my_rgb2lab(img);

L = labImg(:,:,1);
a = labImg(:,:,2);
b = labImg(:,:,3);

hueAngle = atan2(b, a);

chroma = sqrt(a.^2 + b.^2);
chromaNorm = chroma ./ (max(chroma(:)) + eps);
chromaNorm = chromaNorm .^ chromaGamma;

%% ---------------- PREPARE DISPLAY ----------------

figure('Color','w');
hImg = imshow(img);
%title('Pixel-wise motion color encoding: hue = direction, chroma = motion speed');

if saveMovie
    v = VideoWriter(movieName, 'MPEG-4');
    v.FrameRate = fps;
    open(v);
end

%% ---------------- GENERATE MOTION FRAMES ----------------

nBlockY = ceil(H / blockSize);
nBlockX = ceil(W / blockSize);

for frame = 1:nFrames

    t = (frame-1) / fps;

    motionOverlay = zeros(H, W);
    weightSum = zeros(H, W);

    for by = 1:nBlockY
        for bx = 1:nBlockX

            y1 = (by-1)*blockSize + 1;
            y2 = min(by*blockSize, H);

            x1 = (bx-1)*blockSize + 1;
            x2 = min(bx*blockSize, W);

            localH = y2 - y1 + 1;
            localW = x2 - x1 + 1;

            [X, Y] = meshgrid(linspace(-1,1,localW), linspace(-1,1,localH));

            theta = hueAngle(y1:y2, x1:x2);
            strength = chromaNorm(y1:y2, x1:x2);

            directionAxis = X .* cos(theta) + Y .* sin(theta);

            localTemporalFreq = minTemporalFreq + strength .* (maxTemporalFreq - minTemporalFreq);
            phase = 2*pi*localTemporalFreq*t;

            grating = sin(2*pi*spatialFreq*directionAxis - phase);

            localMotion = grating;

            wx = local_hann(localW)';
            wy = local_hann(localH);
            window = wy * wx;

            localMotion = localMotion .* window;

            motionOverlay(y1:y2, x1:x2) = motionOverlay(y1:y2, x1:x2) + localMotion;
            weightSum(y1:y2, x1:x2) = weightSum(y1:y2, x1:x2) + window;
        end
    end

    motionOverlay = motionOverlay ./ (weightSum + eps);

    %% Add luminance motion to original RGB image

    frameImg = img;

    for c = 1:3
        frameImg(:,:,c) = frameImg(:,:,c) + maxMotionContrast * motionOverlay;
    end

    frameImg = min(max(frameImg, 0), 1);

    set(hImg, 'CData', frameImg);
    drawnow;

    if saveMovie
        writeVideo(v, frameImg);
    end
end

if saveMovie
    close(v);
    fprintf('Saved movie: %s\n', movieName);
end

%% ---------------- LOCAL FUNCTIONS ----------------

function lab = my_rgb2lab(rgb)
% Convert sRGB image in range [0,1] to CIELAB using D65 white point

    rgb = min(max(rgb,0),1);

    mask = rgb <= 0.04045;
    rgbLinear = zeros(size(rgb));
    rgbLinear(mask) = rgb(mask) / 12.92;
    rgbLinear(~mask) = ((rgb(~mask) + 0.055) / 1.055) .^ 2.4;

    M = [0.4124564 0.3575761 0.1804375;
         0.2126729 0.7151522 0.0721750;
         0.0193339 0.1191920 0.9503041];

    R = rgbLinear(:,:,1);
    G = rgbLinear(:,:,2);
    B = rgbLinear(:,:,3);

    X = M(1,1)*R + M(1,2)*G + M(1,3)*B;
    Y = M(2,1)*R + M(2,2)*G + M(2,3)*B;
    Z = M(3,1)*R + M(3,2)*G + M(3,3)*B;

    Xn = 0.95047;
    Yn = 1.00000;
    Zn = 1.08883;

    x = X / Xn;
    y = Y / Yn;
    z = Z / Zn;

    delta = 6/29;

    fx = lab_f(x, delta);
    fy = lab_f(y, delta);
    fz = lab_f(z, delta);

    L = 116*fy - 16;
    a = 500*(fx - fy);
    b = 200*(fy - fz);

    lab = cat(3, L, a, b);
end

function f = lab_f(t, delta)
% Helper function for CIELAB conversion

    f = zeros(size(t));
    mask = t > delta^3;

    f(mask) = t(mask).^(1/3);
    f(~mask) = t(~mask)/(3*delta^2) + 4/29;
end

function w = local_hann(N)
% Toolbox-free Hann window

    if N <= 1
        w = ones(N,1);
    else
        n = (0:N-1)';
        w = 0.5 - 0.5*cos(2*pi*n/(N-1));
    end
end