from vietnormalizer import VietnameseNormalizer

normalizer = VietnameseNormalizer()

with open("input.txt", "r", encoding="utf-8") as f:
    lines = f.readlines()

with open("output.txt", "w", encoding="utf-8") as f:
    for line in lines:
        normalized = normalizer.normalize(line.rstrip("\n"))
        f.write(normalized + "\n")
