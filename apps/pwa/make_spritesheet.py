import os
import cv2
import argparse
import numpy as np

parser = argparse.ArgumentParser(description='Create Spritesheet')
parser.add_argument('--location', help='Location of the single frames', required=True)
parser.add_argument('--rows', help='Output rows', required=True, type=int)
parser.add_argument('--cols', help='Output cols', required=True, type=int)

args = parser.parse_args()
images = [image for image in os.listdir(args.location) if image.endswith('png') or image.endswith('jpg')]
images.sort()

pivot = cv2.imread(os.path.join(args.location, images[0]), cv2.IMREAD_UNCHANGED)
print(pivot.shape)
spritesheet = np.zeros((args.rows * pivot.shape[0], args.cols * pivot.shape[1], pivot.shape[2]))

for i, image in enumerate(images):
    frame = cv2.imread(os.path.join(args.location, image), cv2.IMREAD_UNCHANGED)
    y = (i // args.cols) * pivot.shape[0]
    x = (i % args.cols) * pivot.shape[1]
    spritesheet[y:y + pivot.shape[0], x:x + pivot.shape[1], :] = frame

cv2.imwrite(os.path.join(args.location, 'spritesheet.png'), spritesheet)
