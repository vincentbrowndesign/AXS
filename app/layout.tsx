export const metadata = {
title: "AXS",
description: "AXS v0.2",
};

export default function RootLayout({
children,
}: {
children: React.ReactNode;
}) {
return (
<html lang="en">
<body
style={{
margin: 0,
padding: 0,
background: "black",
color: "white",
}}
>
{children}
</body>
</html>
);
}