import Image from "next/image";

export function AuthHero({
  heading,
  schoolName,
  tagline,
}: {
  heading: string;
  schoolName: string;
  tagline: string;
}) {
  return (
    <section className="relative h-64 w-full shrink-0 overflow-hidden bg-black sm:h-80 lg:h-auto lg:flex-[855]">
      <div className="absolute inset-0" aria-hidden>
        <Image
          src="/auth/hero-illustration-bg.png"
          alt=""
          fill
          priority
          className="object-cover opacity-20"
        />
        <Image
          src="/auth/hero-illustration.png"
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/70" />
        <div className="absolute left-[10%] top-[20%] h-[220px] w-[220px] rounded-full bg-black blur-[70px] lg:left-[161px] lg:top-[239px] lg:h-[402px] lg:w-[408px]" />
      </div>

      <Image
        src="/auth/bubble-1.svg"
        alt=""
        width={64}
        height={64}
        aria-hidden
        className="absolute left-6 top-6 hidden h-10 w-10 lg:left-[108px] lg:top-[204px] lg:block lg:h-16 lg:w-16"
      />
      <Image
        src="/auth/bubble-2.svg"
        alt=""
        width={20}
        height={20}
        aria-hidden
        className="absolute hidden lg:left-[631px] lg:top-[736px] lg:block lg:h-5 lg:w-5"
      />

      <div className="relative flex h-full flex-col items-start justify-center gap-3 px-6 py-8 sm:px-10 lg:gap-5 lg:px-[172px]">
        <h1 className="font-display max-w-full text-4xl font-medium leading-tight tracking-tight text-white sm:text-5xl lg:text-[98px] lg:leading-[1.2] lg:tracking-[-2.95px]">
          {heading}
        </h1>
        <p className="font-sans text-xl font-semibold text-brand-tint lg:text-[32px]">
          {schoolName}
        </p>
        <p className="font-sans max-w-md text-sm text-white lg:text-base">
          {tagline}
        </p>
      </div>
    </section>
  );
}
