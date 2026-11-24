"""Render the public OpenWave films and figures from their downloadable data."""

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.animation import FFMpegWriter
from matplotlib.collections import LineCollection
import numpy as np

BG, FG, DIM, GRID = "#0b171e", "#eff8f5", "#a8bbc1", "#30444b"
MINT, GOLD, LILAC = "#70efd1", "#ffb874", "#b5a4ff"
plt.rcParams.update(
    {
        "figure.facecolor": BG,
        "axes.facecolor": BG,
        "text.color": FG,
        "axes.labelcolor": DIM,
        "xtick.color": DIM,
        "ytick.color": DIM,
        "axes.edgecolor": GRID,
        "font.size": 13,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.axisbelow": True,
        "savefig.facecolor": BG,
        "font.family": "DejaVu Sans",
    }
)


def title(fig, text, subtitle):
    fig.text(0.075, 0.937, text, weight="bold", fontsize=24, va="top")
    fig.text(0.075, 0.848, subtitle, color=DIM, fontsize=13, va="top")


def axes(fig, box, xlabel, ylabel):
    ax = fig.add_axes(box)
    ax.grid(axis="y", color=GRID, lw=0.65)
    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    return ax


def video(fig, folder, name, frames, update, poster, fps):
    writer = FFMpegWriter(
        fps=fps,
        codec="libx264",
        extra_args=[
            "-crf",
            "20",
            "-preset",
            "fast",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
        ],
    )
    with writer.saving(fig, folder / (name + ".mp4"), 100):
        for i in range(frames):
            update(i)
            writer.grab_frame()
    update(poster)
    fig.savefig(folder / (name + "-poster.png"), dpi=100)
    plt.close(fig)


def seam_layout(edges):
    # A Tutte embedding fixes one triangular face and draws every other port
    # at the mean of its neighbours. Distances on this diagram have no units.
    outer = [158, 159, 160]
    points = np.array([[-1.12, -0.72], [1.12, -0.72], [0, 1.22]])
    ids = sorted(set(np.ravel(edges)))
    a = np.zeros((12, 12))
    b = np.zeros((12, 2))
    for i, port in enumerate(ids):
        if port in outer:
            a[i, i] = 1
            b[i] = points[outer.index(port)]
        else:
            peers = [v for e in edges if port in e for v in e if v != port]
            a[i, i] = len(peers)
            a[i, [ids.index(v) for v in peers]] = -1
    locations = dict(zip(ids, np.linalg.solve(a, b)))
    # Shared exterior face is visually generous; the opposite neighborhood is
    # compressed. Expand radial distances consistently to separate central bins.
    for k, xy in locations.items():
        norm = np.linalg.norm(xy)
        if norm:
            locations[k] = xy * norm ** (-0.62)
    return np.array([[locations[a], locations[b]] for a, b in edges]), np.array(
        list(locations.values())
    )


def pair(folder, data):
    ts = data["exposure"]
    arms = {k: np.asarray(v) for k, v in data["arms"].items()}
    edges = data["outcomes"][:-1]
    segments, vertices = seam_layout(edges)
    centers = segments.mean(axis=1)
    fig = plt.figure(figsize=(10, 5.6))
    title(
        fig,
        "Where does the pair register?",
        "Cell 13    /    30 seam addresses    /    identical two-load preparation    /    κ = ½",
    )
    scenes = []
    for x, arm, label, color in (
        (0.065, "marked", "Eleven written seams", MINT),
        (0.54, "blank", "Blank seams", GOLD),
    ):
        ax = fig.add_axes([x, 0.18, 0.39, 0.53], aspect="equal")
        ax.set_xlim(-1.17, 1.17)
        ax.set_ylim(-0.89, 1.20)
        ax.axis("off")
        ax.add_collection(LineCollection(segments, colors="#557078", linewidths=1.2))
        if arm == "marked":
            written = [edge in data["written"] for edge in edges]
            exits = [edge in data["exits"] for edge in edges]
            ax.add_collection(
                LineCollection(
                    segments[written], colors=LILAC, linewidths=1.7, linestyles="dashed"
                )
            )
            ax.add_collection(LineCollection(segments[exits], colors=FG, linewidths=2))
        ax.scatter(*vertices.T, s=14, color="#849598")
        rings = ax.scatter(*centers.T, s=0, color=color, alpha=0.82, linewidth=0)
        ax.set_title(label, color=color, fontsize=17, weight="bold", pad=7)
        label_artist = fig.text(
            x + 0.194, 0.13, "", ha="center", color=color, weight="bold", fontsize=17
        )
        scenes.append((arm, rings, label_artist))
    stamp = fig.text(0.5, 0.045, "", ha="center", color=DIM, fontsize=12)

    def update(i):
        for arm, rings, label_artist in scenes:
            bins = arms[arm][i]
            rings.set_sizes(1600 * bins[:-1])
            label_artist.set_text(
                f"{100 * (1 - bins[-1]):.2f}% home   /   {100 * bins[-1]:.2f}% quiet"
            )
        stamp.set_text(
            f"Exposure {ts[i]:05.2f}     •     Disc area = probability at that seam"
        )

    video(fig, folder, "connected-pair", len(ts), update, -1, 10)
    fig = plt.figure(figsize=(9, 5.5))
    title(
        fig,
        "How often does the pair stay home?",
        "Fresh preparations at each exposure. Symbols mark the three filed appointments.",
    )
    ax = axes(
        fig,
        [0.115, 0.18, 0.84, 0.56],
        "Free exposure (native units)",
        "Home probability (%)",
    )
    for arm, label, color, style, marker in (
        ("marked", "Written", MINT, "-", "o"),
        ("blank", "Blank", GOLD, "--", "s"),
        ("swap", "Random swaps", LILAC, ":", "^"),
    ):
        home = 100 * (1 - arms[arm][:, -1])
        ax.plot(ts, home, style, color=color, label=label, lw=2.4)
        ax.scatter(
            [1, 7, 37],
            home[[4, 28, 148]],
            c=color,
            marker=marker,
            s=42,
            clip_on=False,
            zorder=4,
        )
    ax.set(xlim=(0, 37), ylim=(0, 104), yticks=[0, 25, 50, 75, 100])
    ax.legend(
        frameon=False, ncol=3, loc="lower left", bbox_to_anchor=(0, 1.00), fontsize=12
    )
    fig.savefig(folder / "pair-persistence.png", dpi=140)
    plt.close(fig)


def strand(folder, data, board):
    times = np.array(data["exposure"])
    n = board["dimers"]
    positions = np.arange(n + 1)
    far = board["far"]
    fig = plt.figure(figsize=(10, 5.6))
    title(
        fig,
        "How far does the reversal travel?",
        f"{board['cells']} cells    /    {n} dimers    /    reversal at address {board['source']} or {board['reference']}",
    )
    ax = axes(
        fig,
        [0.105, 0.23, 0.84, 0.47],
        "Receiver address along the strand",
        "Difference (pp)",
    )
    ax.set(xlim=(-0.5, n + 0.5), ylim=(-106, 106), yticks=[-100, -50, 0, 50, 100])
    ax.axhline(0, color=DIM, lw=0.7)
    (native,) = ax.plot([], [], color=MINT, marker="o", ms=4, lw=2.0, label="Coupled")
    (control,) = ax.plot([], [], color=GOLD, ls="--", lw=1.6, label="Coupling off")
    dots = ax.scatter(
        [],
        [],
        s=56,
        facecolor="none",
        edgecolor=FG,
        label="Recorded, coupled",
        zorder=4,
    )
    ax.legend(
        frameon=False,
        ncol=3,
        loc="lower left",
        bbox_to_anchor=(-0.014, 1.01),
        fontsize=12,
    )
    ax.scatter(
        far, np.full(len(far), -102), color=LILAC, s=18, marker="|", clip_on=False
    )
    status = fig.text(0.075, 0.052, "", fontsize=13, color=DIM)
    expected = {k: np.array(v) * 100 for k, v in board["expectation"].items()}

    def update(i):
        for name, line in (("native", native), ("control", control)):
            line.set_data(positions, expected[name][i])
        t = times[i]
        count = board["counts"]["native"].get(str(int(t))) if t.is_integer() else None
        if count is None:
            dots.set_offsets(np.empty((0, 2)))
        else:
            dots.set_offsets(
                np.c_[
                    positions, 100 * (np.array(count[0]) - count[1]) / board["trials"]
                ]
            )
        status.set_text(
            f"Exposure {t:04.2f}     /     Lines: model expectation     /     Violet ticks: distant receivers"
        )

    # Hold actual acquisition frames long enough to see the observation rings.
    indices = [
        i for i, t in enumerate(times) for _ in range(9 if t in (0, 2, 4, 8) else 1)
    ]
    video(
        fig,
        folder,
        f"strand-{board['cells']}",
        len(indices),
        lambda i: update(indices[i]),
        -1,
        10,
    )


def dispersion(folder, data):
    fig = plt.figure(figsize=(9, 7.3))
    title(
        fig,
        "Frequency from wavelength",
        "Independent receiver profiles set k. Separate timing records set ω.",
    )
    ax = axes(fig, [0.15, 0.52, 0.805, 0.24], "", "Frequency ω")
    err = axes(
        fig,
        [0.15, 0.15, 0.805, 0.235],
        "Wave number k (radians per dimer)",
        "ω − forecast",
    )
    meter = data["boards"][0]["meter"]
    max_k = max(m["k"] for b in data["boards"] for m in b["modes"]) * 1.04
    k = np.linspace(0, max_k, 200)
    forecast = np.sqrt(meter["m"] ** 2 + meter["c_squared"] * (2 - 2 * np.cos(k)))
    ax.plot(k, forecast, color=FG, lw=1.8, label="Lattice forecast")
    for b, color, marker in zip(data["boards"], [MINT, GOLD, LILAC], ["o", "s", "^"]):
        modes = b["modes"]
        kw = dict(
            s=45,
            marker=marker,
            facecolors="none",
            edgecolors=color,
            linewidths=1.5,
            zorder=4,
        )
        x = [r["k"] for r in modes]
        ax.scatter(x, [r["omega"] for r in modes], label=f"{b['cells']} cells", **kw)
        err.scatter(x, [r["lattice_residual"] for r in modes], **kw)
    tol = data["tolerance"]
    err.axhspan(-tol, tol, color=MINT, alpha=0.06)
    for sign in (-1, 1):
        err.axhline(sign * tol, color=DIM, ls="--", lw=1)
    err.axhline(0, color=DIM, lw=0.65)
    err.set(
        ylim=(-0.0059, 0.0059),
        yticks=[-tol, 0, tol],
        yticklabels=["−0.0048", "0", "+0.0048"],
    )
    for axis in (ax, err):
        axis.set_xlim(0, max_k)
    ax.legend(
        ncol=4,
        loc="lower left",
        bbox_to_anchor=(-0.015, 1.03),
        frameon=False,
        fontsize=11,
    )
    fig.text(
        0.12,
        0.042,
        "Dashed limits show the prespecified frequency tolerance in local clock units.",
        color=DIM,
        fontsize=12,
    )
    fig.savefig(folder / "strand-dispersion.png", dpi=140)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("folder", type=Path)
    folder = parser.parse_args().folder
    pair(folder, json.loads((folder / "connected-pair.json").read_text()))
    data = json.loads((folder / "strand.json").read_text())
    for board in data["boards"]:
        strand(folder, data, board)
    dispersion(folder, data)


if __name__ == "__main__":
    main()
